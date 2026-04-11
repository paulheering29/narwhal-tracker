import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check is_owner via service client (bypasses RLS)
  const service = createServiceClient()
  const { data: staff } = await service
    .from('staff')
    .select('is_owner')
    .eq('auth_id', user.id)
    .single()

  if (!staff?.is_owner) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <header style={{ backgroundColor: '#457595' }} className="shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
          <span className="text-white font-semibold">🦭 Narwhal Owner Panel</span>
          <a href="/dashboard" className="text-sm text-white/70 hover:text-white transition-colors">
            ← Back to app
          </a>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
    </div>
  )
}
