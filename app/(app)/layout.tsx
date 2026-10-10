import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDisplayName } from '@/lib/display-name'
import { getCredential } from '@/lib/credentials'
import { canManageTrainings } from '@/lib/permissions'
import { TopNav } from '@/components/topnav'
import { IdleTimeout } from '@/components/idle-timeout'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: staff } = await supabase
    .from('staff')
    .select('id, tier, role, roles, first_name, last_name, display_first_name, display_last_name')
    .eq('auth_id', user.id)
    .single()

  const userTier  = (staff?.tier  ?? 'rbt')    as 'rbt' | 'staff'
  const userRoles = (staff?.roles ?? [])        as string[]
  const userName  = staff ? getDisplayName(staff) : (user.email ?? '')
  // Staff accounts who also hold a credential (e.g. a BCBA who trains) get a
  // My Progress link; learner accounts already see it on their dashboard.
  const showMyProgress = userTier === 'staff' && (await getCredential(supabase, staff?.role)) !== null

  // Outside trainings waiting for someone else to review (nobody reviews their own).
  let pendingReviews = 0
  if (userTier === 'staff' && canManageTrainings(userRoles)) {
    const { count } = await supabase
      .from('external_trainings')
      .select('id', { count: 'exact', head: true })
      .eq('review_status', 'pending')
      .neq('staff_id', staff?.id ?? '')
    pendingReviews = count ?? 0
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <TopNav userTier={userTier} userRoles={userRoles} userName={userName} showMyProgress={showMyProgress} pendingReviews={pendingReviews} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <IdleTimeout />
    </div>
  )
}
