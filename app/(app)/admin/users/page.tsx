import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AdminUsersClient } from './client'
import { canManageUsers } from '@/lib/permissions'
import { getCompanyBilling, getAllPlans, getRBTCount } from '@/lib/plans'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('staff')
    .select('tier, roles, company_id')
    .eq('auth_id', user.id)
    .single()

  if (!me || !canManageUsers(me.roles ?? [])) redirect('/dashboard')

  // Companies has a blanket "no direct user access" RLS policy, so use the
  // service client to fetch the caller's own company name.
  const service = createServiceClient()
  const companyPromise = service
    .from('companies')
    .select('id, name, logo_url, org_contact_staff_id, preferred_cert_template')
    .eq('id', me.company_id)
    .single()

  const [{ data: staff }, { data: topics }, { data: company }, billing, allPlans, rbtCount] = await Promise.all([
    supabase
      .from('staff')
      .select('id, auth_id, first_name, last_name, display_first_name, display_last_name, email, role, ehr_id, active, tier, roles, certification_number, credentials')
      .eq('company_id', me.company_id)
      .order('last_name'),
    supabase
      .from('topics')
      .select('id, name, created_at')
      .order('name'),
    companyPromise,
    getCompanyBilling(me.company_id),
    getAllPlans(),
    getRBTCount(me.company_id),
  ])

  const planLimits = {
    maxRbts:     billing?.plan?.max_rbts     ?? 5,
    currentRbts: rbtCount,
    planName:    billing?.plan?.display_name ?? 'Free',
  }

  return (
    <AdminUsersClient
      currentAuthId={user.id}
      currentRoles={me.roles ?? []}
      initialStaff={staff ?? []}
      initialTopics={topics ?? []}
      initialCompany={company ?? { id: me.company_id, name: '' }}
      planLimits={planLimits}
      billing={billing}
      allPlans={allPlans}
    />
  )
}
