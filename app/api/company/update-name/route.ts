import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Rename the caller's own company. Only Account Owners may call this.
 * Uses the service client because the companies table has a blanket
 * "no direct user access" RLS policy.
 */
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

  const { name } = await request.json()
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) {
    return NextResponse.json({ error: 'Company name is required.' }, { status: 400 })
  }

  const { error } = await service
    .from('companies')
    .update({ name: trimmed })
    .eq('id', me.company_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
