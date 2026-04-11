import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminUsersClient } from './client'
import { canManageUsers } from '@/lib/permissions'
import { getCompanyBilling, getRBTCount } from '@/lib/plans'

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

  const [{ data: staff }, { data: topics }, billing, rbtCount] = await Promise.all([
    supabase
      .from('staff')
      .select('id, auth_id, first_name, last_name, display_first_name, display_last_name, email, role, ehr_id, active, tier, roles')
      .eq('company_id', me.company_id)
      .order('last_name'),
    supabase
      .from('topics')
      .select('id, name, created_at')
      .order('name'),
    getCompanyBilling(me.company_id),
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
      initialStaff={staff ?? []}
      initialTopics={topics ?? []}
      planLimits={planLimits}
    />
  )
}
