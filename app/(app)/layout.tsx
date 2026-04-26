import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopNav } from '@/components/topnav'
import { IdleTimeout } from '@/components/idle-timeout'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: staff } = await supabase
    .from('staff')
    .select('tier, roles, first_name, last_name')
    .eq('auth_id', user.id)
    .single()

  const userTier  = (staff?.tier  ?? 'rbt')    as 'rbt' | 'staff'
  const userRoles = (staff?.roles ?? [])        as string[]
  const userEmail = user.email ?? ''

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <TopNav userTier={userTier} userRoles={userRoles} userEmail={userEmail} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <IdleTimeout />
    </div>
  )
}
