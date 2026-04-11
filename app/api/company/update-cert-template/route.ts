import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'

const VALID_TEMPLATES = ['bacb', 'formal', 'fun', 'basic']

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service
    .from('staff')
    .select('company_id, roles')
    .eq('auth_id', user.id)
    .single()

  if (!me?.roles?.includes('Account Owner')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { enabled_cert_templates } = await request.json()

  if (!Array.isArray(enabled_cert_templates) || enabled_cert_templates.length === 0) {
    return NextResponse.json({ error: 'At least one template must be selected' }, { status: 400 })
  }

  const invalid = enabled_cert_templates.find((t: string) => !VALID_TEMPLATES.includes(t))
  if (invalid) {
    return NextResponse.json({ error: 'Invalid template' }, { status: 400 })
  }

  const { error } = await service
    .from('companies')
    .update({
      enabled_cert_templates,
      preferred_cert_template: enabled_cert_templates[0],
    })
    .eq('id', me.company_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
