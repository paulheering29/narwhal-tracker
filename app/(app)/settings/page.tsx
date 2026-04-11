import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: staff } = await supabase
    .from('staff')
    .select('signature_url')
    .eq('auth_id', user.id)
    .single()

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
        currentSignatureUrl={staff?.signature_url ?? null}
      />
    </div>
  )
}
