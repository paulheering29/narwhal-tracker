import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { SUPPORTED_STATE_CODES } from '@/lib/license-check/sources'
import { syncSubscriptionQuantities } from '@/lib/billing'

/**
 * Choose which states are checked nightly ($10/month each). Account Owner only.
 * Replaces the whole list, and tells Stripe the new count if there's a subscription.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('staff').select('company_id, roles').eq('auth_id', user.id).single()
  if (!me?.roles?.includes('Account Owner')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { codes } = await request.json().catch(() => ({}))
  if (!Array.isArray(codes) || !codes.every(c => typeof c === 'string')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const chosen = Array.from(new Set(codes as string[])).filter(c => SUPPORTED_STATE_CODES.includes(c))

  const { error: clearError } = await service.from('company_license_states').delete().eq('company_id', me.company_id)
  if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 })
  if (chosen.length > 0) {
    const { error } = await service.from('company_license_states')
      .insert(chosen.map(jurisdiction_code => ({ company_id: me.company_id, jurisdiction_code })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    await syncSubscriptionQuantities(me.company_id)
  } catch (err) {
    console.error('billing sync failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Saved, but the billing update failed. It will be corrected overnight.' }, { status: 502 })
  }
  return NextResponse.json({ success: true, codes: chosen })
}
