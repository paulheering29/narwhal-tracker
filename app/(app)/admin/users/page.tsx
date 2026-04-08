import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminUsersClient } from './client'
import { canManageUsers } from '@/lib/permissions'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('tier, roles, company_id')
    .eq('id', user.id)
    .single()

  if (!profile || !canManageUsers(profile.roles ?? [])) redirect('/dashboard')

  const [{ data: users }, { data: staff }, { data: topics }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, tier, roles, first_name, last_name')
      .eq('company_id', profile.company_id)
      .order('last_name'),
    supabase
      .from('staff')
      .select('id, first_name, last_name, display_first_name, display_last_name, email, role, ehr_id, active')
      .eq('company_id', profile.company_id)
      .order('last_name'),
    supabase
      .from('topics')
      .select('id, name, created_at')
      .order('name'),
  ])

  return (
    <AdminUsersClient
      currentUserId={user.id}
      initialUsers={users ?? []}
      initialStaff={staff ?? []}
      initialTopics={topics ?? []}
    />
  )
}
