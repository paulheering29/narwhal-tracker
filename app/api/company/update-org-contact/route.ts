import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Set the company's In-Service Organization Contact (a staff member).
 * Only Account Owners may call this.
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

  const { org_contact_staff_id } = await request.json()

  const { error } = await service
    .from('companies')
    .update({ org_contact_staff_id: org_contact_staff_id ?? null })
    .eq('id', me.company_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
