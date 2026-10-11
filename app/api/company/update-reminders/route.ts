import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/** Turn renewal reminder emails on or off for the company. Account Owners only. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('staff').select('company_id, roles').eq('auth_id', user.id).single()
  if (!me?.roles?.includes('Account Owner')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { enabled } = await request.json().catch(() => ({}))
  if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'Invalid setting' }, { status: 400 })

  const { error } = await service.from('companies').update({ license_reminders_enabled: enabled }).eq('id', me.company_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
