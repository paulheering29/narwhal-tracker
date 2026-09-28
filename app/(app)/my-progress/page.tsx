import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCredential } from '@/lib/credentials'
import { PersonalDashboard } from '../dashboard/personal-dashboard'
import { getPersonalDashboardData } from '../dashboard/personal-data'

// Staff accounts (trainers/admins) land on the team dashboard, so this is
// where one who also holds a credential — e.g. a BCBA who trains — sees
// their own cycle and CEUs. Learner accounts already get this on /dashboard.
export default async function MyProgressPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: staff } = await supabase
    .from('staff')
    .select('id, tier, role, is_supervisor')
    .eq('auth_id', user.id)
    .single()

  if (!staff) redirect('/dashboard')
  if (staff.tier === 'rbt') redirect('/dashboard')

  const credential = await getCredential(supabase, staff.role)
  const data       = await getPersonalDashboardData(supabase, staff.id, credential, staff.is_supervisor ?? false)

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">My Progress</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your certification, {credential ? `${credential.unit_label}s` : 'progress'}, and training
        </p>
      </div>
      <PersonalDashboard data={data} />
    </div>
  )
}
