'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'

const MIN_PASSWORD = 10

export default function ChangePasswordPage() {
  const supabase = createClient()

  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [show, setShow]         = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setDone(false)
    if (next.length < MIN_PASSWORD) { setError(`New password must be at least ${MIN_PASSWORD} characters.`); return }
    if (next !== confirm)           { setError('The new passwords don’t match.'); return }
    if (next === current)           { setError('Choose a password different from your current one.'); return }

    setSaving(true)
    // Prove it's really them (someone could be at an unlocked laptop) by checking
    // the current password before changing it.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setError('Could not find your account. Please sign in again.'); setSaving(false); return }
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: current })
    if (verifyError) { setError('Your current password is incorrect.'); setSaving(false); return }

    const { error: updateError } = await supabase.auth.updateUser({ password: next })
    setSaving(false)
    if (updateError) { setError(updateError.message); return }

    setCurrent(''); setNext(''); setConfirm(''); setDone(true)
  }

  return (
    <div className="p-4 md:p-8 max-w-md">
      <h1 className="text-2xl font-semibold text-gray-900">Change password</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">Choose a new password for your account.</p>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="current">Current password</Label>
          <Input id="current" type={show ? 'text' : 'password'} autoComplete="current-password" required
            value={current} onChange={e => setCurrent(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new">New password</Label>
          <div className="relative">
            <Input id="new" type={show ? 'text' : 'password'} autoComplete="new-password" required
              value={next} onChange={e => setNext(e.target.value)} placeholder={`At least ${MIN_PASSWORD} characters`} className="pr-9" />
            <button type="button" onClick={() => setShow(v => !v)} tabIndex={-1} title={show ? 'Hide' : 'Show'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" required
            value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
        {done && (
          <p className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-md px-3 py-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Password updated.
          </p>
        )}

        <Button type="submit" disabled={saving} className="w-full bg-[#025CA8] hover:bg-[#024A87]">
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</> : 'Update password'}
        </Button>
      </form>
    </div>
  )
}
