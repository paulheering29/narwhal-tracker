'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CONTACT_EMAIL } from '@/lib/pricing'

/**
 * Replaces the app once a trial has ended with no subscription. The Account
 * Owner subscribes right here; everyone else is told who to ask. Data is
 * untouched -- subscribing brings everything straight back.
 */
export function AccessGate({ isAccountOwner }: { isAccountOwner: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const justPaid = searchParams.get('success') === 'true'

  // Coming back from Stripe, the webhook that unlocks the account may land a
  // moment after the redirect, so keep checking instead of showing a dead end.
  useEffect(() => {
    if (!justPaid) return
    const id = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(id)
  }, [justPaid, router])

  async function subscribe() {
    setLoading(true)
    const res = await fetch('/api/stripe/checkout', { method: 'POST' })
    const { url, error } = await res.json()
    if (error) { alert(error); setLoading(false); return }
    window.location.href = url
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      {justPaid ? (
        <>
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[#025CA8]" />
          <h1 className="text-xl font-semibold text-gray-900">Finishing setup…</h1>
          <p className="mt-2 text-sm text-gray-500">Your payment went through. This page will open in a moment.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-gray-900">Your free trial has ended</h1>
          {isAccountOwner ? (
            <>
              <p className="mt-3 text-sm text-gray-500">
                Subscribe to keep using Training Loop. Everything you entered is saved and comes back as soon as you do.
              </p>
              <Button className="mt-6 bg-[#025CA8] hover:bg-[#024A87]" onClick={subscribe} disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting…</> : 'Subscribe'}
              </Button>
              <p className="mt-4 text-xs text-gray-400">
                Fewer than 10 RBTs and BCBAs, or a non-profit? <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#025CA8] hover:underline">Contact us</a> for a discounted plan.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              Ask your organization&apos;s Account Owner to subscribe. Your records are saved and will be here when they do.
            </p>
          )}
        </>
      )}
    </div>
  )
}
