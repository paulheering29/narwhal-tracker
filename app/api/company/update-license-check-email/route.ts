import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Turn the nightly license check email on or off, and choose who gets it.
 * Account Owners only. Recipients must be active people in this company with an
 * email address -- anything else in the list is ignored, so the email can never
 * be pointed at an outside address.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('staff').select('company_id, roles').eq('auth_id', user.id).single()
  if (!me?.roles?.includes('Account Owner')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { enabled, recipient_ids } = await request.json().catch(() => ({}))
  if (typeof enabled !== 'boolean' || !Array.isArray(recipient_ids) || !recipient_ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'Invalid setting' }, { status: 400 })
  }

  const { data: eligible } = await service.from('staff').select('id')
    .eq('company_id', me.company_id).eq('active', true).not('email', 'is', null)
  const allowed = new Set((eligible ?? []).map(s => s.id as string))
  const chosen = Array.from(new Set(recipient_ids as string[])).filter(id => allowed.has(id))

  if (enabled && chosen.length === 0) {
    return NextResponse.json({ error: 'Choose at least one person to send it to.' }, { status: 400 })
  }

  const { error } = await service.from('companies').update({ license_check_email_enabled: enabled }).eq('id', me.company_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The recipient list is kept even while the email is off, so turning it back on remembers it.
  const { error: clearError } = await service.from('staff').update({ license_check_email: false }).eq('company_id', me.company_id)
  if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 })
  if (chosen.length > 0) {
    const { error: setError } = await service.from('staff').update({ license_check_email: true }).in('id', chosen).eq('company_id', me.company_id)
    if (setError) return NextResponse.json({ error: setError.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, recipient_ids: chosen })
}
