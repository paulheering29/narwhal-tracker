import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { applyManualList } from '@/lib/license-check/run'
import { readArizonaExport } from '@/lib/license-check/arizona'
import { fetchOhio } from '@/lib/license-check/ohio'

// Ohio's sweep is about 100 searches with a pause between each (a couple of minutes).
export const maxDuration = 300

const MAX_UPLOAD_BYTES = 10_000_000

/**
 * Owner only. Supplies the lists of states whose sites won't talk to a server:
 *  - Arizona: the CSV the owner downloaded from the state's registry (multipart `file`).
 *  - Ohio:    the search request the owner copied from their browser (JSON `{ state: 'OH', request }`).
 * The list is stored and everyone in that state is re-checked straight away.
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('staff').select('is_owner').eq('auth_id', user.id).single()
  if (!me?.is_owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    let state: string
    let licenses
    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await request.formData()
      state = String(form.get('state') ?? '')
      const file = form.get('file')
      if (state !== 'AZ') return NextResponse.json({ error: 'Only Arizona is uploaded as a file.' }, { status: 400 })
      if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose the file you downloaded from Arizona.' }, { status: 400 })
      if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'That file is far larger than Arizona’s export should be.' }, { status: 400 })
      licenses = readArizonaExport(await file.text())
    } else {
      const body = await request.json().catch(() => ({}))
      state = String(body.state ?? '')
      if (state !== 'OH' || typeof body.request !== 'string') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
      licenses = await fetchOhio(body.request)   // the pasted request holds short-lived tokens; it is used here and not kept
    }

    const { count, checked } = await applyManualList(service, state, licenses)
    return NextResponse.json({ success: true, state, count, checked })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, { status: 422 })
  }
}
