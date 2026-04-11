import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch profile with regular client (scoped to user.id — always works)
  const profileRes = await supabase
    .from('profiles')
    .select('id, company_id, first_name, last_name, signature_url, staff_id')
    .eq('id', user.id)
    .single()

  const profile = profileRes.data

  // Fetch staff with service client — bypass RLS to guarantee results
  // (RLS JWT claims can be stale/missing for new users)
  const service = createServiceClient()
  const staffRes = profile?.company_id
    ? await service
        .from('staff')
        .select('id, first_name, last_name, display_first_name, display_last_name, email, role')
        .eq('company_id', profile.company_id)
        .eq('active', true)
        .order('last_name')
    : { data: [] }

  const staffList = staffRes.data ?? []

  // Always try to match by email — overrides any stale/incorrect existing link
  let resolvedStaffId = profile?.staff_id ?? null

  if (user.email) {
    const matched = staffList.find(
      s => s.email && s.email.toLowerCase() === user.email!.toLowerCase()
    )
    if (matched && matched.id !== resolvedStaffId) {
      // Email match found — save it (replaces any stale link)
      await service
        .from('profiles')
        .update({ staff_id: matched.id })
        .eq('id', user.id)
      resolvedStaffId = matched.id
    } else if (matched) {
      resolvedStaffId = matched.id
    }
  }

  // Show all active staff — don't filter by role, anyone may need to link
  const trainerStaff = staffList

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
