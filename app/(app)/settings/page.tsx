import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, staffRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, signature_url, staff_id')
      .eq('id', user.id)
      .single(),
    // Only staff-tier people (Trainers, Admins) ever need a signature — exclude RBTs
    supabase
      .from('staff')
      .select('id, first_name, last_name, display_first_name, display_last_name, email, role')
      .eq('active', true)
      .or('role.neq.RBT,role.is.null')
      .order('last_name'),
  ])

  const profile   = profileRes.data
  const staffList = staffRes.data ?? []

  // Try to auto-detect by email match if not already linked
  const autoMatchedStaff = !profile?.staff_id
    ? staffList.find(s => s.email && user.email && s.email.toLowerCase() === user.email.toLowerCase())
    : null

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">My Profile &amp; Signature</h1>
        <p className="mt-1 text-sm text-gray-500">
          This page is for your own account only. Tell the system which staff record is yours,
          then draw your signature once — it will be placed automatically on any certificate
          where you are listed as the trainer.
        </p>
      </div>

      <SettingsClient
        userId={user.id}
        currentSignatureUrl={profile?.signature_url ?? null}
        currentStaffId={profile?.staff_id ?? autoMatchedStaff?.id ?? null}
        staffList={staffList.map(s => ({
          id:         s.id,
          first_name: s.first_name,
          last_name:  s.last_name,
          display_first_name: s.display_first_name ?? null,
          display_last_name:  s.display_last_name  ?? null,
        }))}
      />
    </div>
  )
}
