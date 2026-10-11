import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const ACCESS_TYPES = ['paid', 'beta', 'comp']

/**
 * Owner-only actions for free/beta access:
 *  - setCompany: change an organization's plan, access type and note
 *  - addGrant / removeGrant: pre-approve an email so its signup gets a plan automatically
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('staff').select('is_owner').eq('auth_id', user.id).single()
  if (!me?.is_owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  if (body.action === 'setCompany') {
    if (!body.companyId || !ACCESS_TYPES.includes(body.accessType)) {
      return NextResponse.json({ error: 'companyId and a valid accessType are required' }, { status: 400 })
    }
    const { error } = await service.from('companies').update({
      plan_id: body.planId || null,
      access_type: body.accessType,
      access_note: String(body.note ?? '').trim() || null,
    }).eq('id', body.companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (body.action === 'addGrant') {
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
    if (!body.planId || !['beta', 'comp'].includes(body.accessType)) {
      return NextResponse.json({ error: 'Choose a plan and access type.' }, { status: 400 })
    }
    const note = String(body.note ?? '').trim() || null

    // If they've already signed up, apply it to their organization right away
    // instead of waiting for a signup that will never come.
    const { data: existing } = await service
      .from('staff').select('company_id').eq('email', email).contains('roles', ['Account Owner']).limit(1).maybeSingle()
    const claimed = existing?.company_id
      ? { claimed_company_id: existing.company_id, claimed_at: new Date().toISOString() }
      : {}

    const { error } = await service.from('access_grants').insert({
      email, plan_id: body.planId, access_type: body.accessType, note, ...claimed,
    })
    if (error) {
      const msg = error.code === '23505' ? 'That email is already on the list.' : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    if (existing?.company_id) {
      await service.from('companies').update({
        plan_id: body.planId, access_type: body.accessType, access_note: note,
      }).eq('id', existing.company_id)
    }
    return NextResponse.json({ success: true, appliedToExisting: !!existing?.company_id })
  }

  if (body.action === 'removeGrant') {
    if (!body.grantId) return NextResponse.json({ error: 'grantId required' }, { status: 400 })
    const { error } = await service.from('access_grants').delete().eq('id', body.grantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
