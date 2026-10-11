import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { syncQuietly } from '@/lib/billing'

/**
 * Bring the subscription's headcount in line after people are added, removed,
 * or reactivated. Called by the staff screens, which write to the database
 * directly and so can't adjust Stripe themselves. Idempotent; any signed-in
 * member can trigger it, and it only ever syncs their own organization.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await createServiceClient().from('staff').select('company_id').eq('auth_id', user.id).single()
  if (!me?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })

  await syncQuietly(me.company_id)
  return NextResponse.json({ success: true })
}
