import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
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
    supabase
      .from('staff')
      .select('id, first_name, last_name, display_first_name, display_last_name, email, role')
      .eq('active', true)
      .order('last_name'),
  ])

  const profile   = profileRes.data
  const staffList = staffRes.data ?? []

  // Auto-match by email if not already linked
  let resolvedStaffId = profile?.staff_id ?? null

  if (!resolvedStaffId && user.email) {
    const matched = staffList.find(
      s => s.email && s.email.toLowerCase() === user.email!.toLowerCase()
    )
    if (matched) {
      // Save the link automatically — no manual step needed
      const service = createServiceClient()
      await service
        .from('profiles')
        .update({ staff_id: matched.id })
        .eq('id', user.id)
      resolvedStaffId = matched.id
    }
  }

  // Only show non-RBT staff in the dropdown — this page is for trainers
  const trainerStaff = staffList.filter(s => s.role !== 'RBT')

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">My Profile &amp; Signature</h1>
        <p className="mt-1 text-sm text-gray-500">
          Draw your signature once — it will be placed automatically on any certificate
          where you are listed as the trainer.
        </p>
      </div>

      <SettingsClient
        userId={user.id}
        currentSignatureUrl={profile?.signature_url ?? null}
        currentStaffId={resolvedStaffId}
        staffList={trainerStaff.map(s => ({
          id:                 s.id,
          first_name:         s.first_name,
          last_name:          s.last_name,
          display_first_name: s.display_first_name ?? null,
          display_last_name:  s.display_last_name  ?? null,
        }))}
      />
    </div>
  )
}
