import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StaffPageClient } from './client'
import { getCompanyBilling, getRBTCount } from '@/lib/plans'

export default async function StaffPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('staff')
    .select('tier, roles, company_id')
    .eq('auth_id', user.id)
    .single()

  if (!me) redirect('/login')

  const [{ data: staff }, billing, rbtCount, { data: credentialTypes }, { count: pendingOutside }] = await Promise.all([
    supabase
      .from('staff')
      .select('id, auth_id, first_name, last_name, display_first_name, display_last_name, email, role, ehr_id, active, tier, roles, certification_number, credentials, is_supervisor')
      .eq('company_id', me.company_id)
      .order('last_name'),
    getCompanyBilling(me.company_id),
    getRBTCount(me.company_id),
    supabase.from('credential_types').select('code, unit_label, units_required, ethics_units_required, supervision_units_required').order('sort_order'),
    supabase.from('external_trainings').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
  ])

  const planLimits = {
    maxRbts:     billing?.plan?.max_rbts     ?? 5,
    currentRbts: rbtCount,
    planName:    billing?.plan?.display_name ?? 'Free',
  }

  return (
    <StaffPageClient
      currentAuthId={user.id}
      currentRoles={me.roles ?? []}
      initialStaff={staff ?? []}
      planLimits={planLimits}
      credentialTypes={(credentialTypes ?? []).map(c => ({
        ...c,
        units_required:             Number(c.units_required),
        ethics_units_required:      Number(c.ethics_units_required),
        supervision_units_required: Number(c.supervision_units_required),
      }))}
      pendingOutsideReviews={pendingOutside ?? 0}
    />
  )
}
