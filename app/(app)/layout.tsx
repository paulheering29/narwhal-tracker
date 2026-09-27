import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDisplayName } from '@/lib/display-name'
import { getCredential } from '@/lib/credentials'
import { TopNav } from '@/components/topnav'
import { IdleTimeout } from '@/components/idle-timeout'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: staff } = await supabase
    .from('staff')
    .select('tier, role, roles, first_name, last_name, display_first_name, display_last_name')
    .eq('auth_id', user.id)
    .single()

  const userTier  = (staff?.tier  ?? 'rbt')    as 'rbt' | 'staff'
  const userRoles = (staff?.roles ?? [])        as string[]
  const userName  = staff ? getDisplayName(staff) : (user.email ?? '')
  // Staff accounts who also hold a credential (e.g. a BCBA who trains) get a
  // My Progress link; learner accounts already see it on their dashboard.
  const showMyProgress = userTier === 'staff' && (await getCredential(supabase, staff?.role)) !== null

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <TopNav userTier={userTier} userRoles={userRoles} userName={userName} showMyProgress={showMyProgress} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <IdleTimeout />
    </div>
  )
}
