'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCheck } from 'lucide-react'
import type { BillingSummary } from '@/lib/billing'
import {
  BASE_CENTS, USER_CENTS, STATE_CENTS, CONTACT_EMAIL, TRIAL_DAYS, formatMoney, monthlyTotalCents,
} from '@/lib/pricing'

type StateOption = { code: string; name: string }

type Props = {
  billing: BillingSummary | null
  /** States we can check nightly, with names. */
  supportedStates: StateOption[]
}

export function BillingClient({ billing, supportedStates }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState<'checkout' | 'portal' | null>(null)
  const [justPaid, setJustPaid] = useState(false)
  const [chosen, setChosen] = useState<string[]>(billing?.states ?? [])
  const [statesSaving, setStatesSaving] = useState(false)
  const [statesError, setStatesError] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('success') === 'true') setJustPaid(true)
  }, [searchParams])

  const users = billing?.users ?? 0
  const access = billing?.access ?? 'trial'
  const total = monthlyTotalCents(users, chosen.length)
  const dirty = chosen.slice().sort().join() !== (billing?.states ?? []).slice().sort().join()

  async function go(kind: 'checkout' | 'portal') {
    setLoading(kind)
    const res = await fetch(kind === 'checkout' ? '/api/stripe/checkout' : '/api/stripe/portal', { method: 'POST' })
    const { url, error } = await res.json()
    if (error) { alert(error); setLoading(null); return }
    window.location.href = url
  }

  async function saveStates() {
    setStatesSaving(true); setStatesError(null)
    const res = await fetch('/api/billing/states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: chosen }),
    })
    const { error } = await res.json().catch(() => ({ error: 'Something went wrong.' }))
    setStatesSaving(false)
    if (error) setStatesError(error)
    router.refresh()
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          One plan: {formatMoney(BASE_CENTS)} a month plus {formatMoney(USER_CENTS)} per person.
        </p>
      </div>

      {justPaid && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
          <CheckCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800 font-medium">You&apos;re all set! Thanks for subscribing.</p>
        </div>
      )}

      {/* Status */}
      <div className="mb-6 rounded-xl border bg-white shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Status</p>
            {access === 'subscribed' && <p className="text-2xl font-bold text-gray-900">Subscribed</p>}
            {access === 'comped' && <p className="text-2xl font-bold text-gray-900">Complimentary access</p>}
            {access === 'trial' && (
              <>
                <p className="text-2xl font-bold text-gray-900">Free trial</p>
                <p className="mt-1 text-sm text-gray-500">
                  {billing?.daysLeft} {billing?.daysLeft === 1 ? 'day' : 'days'} left of your {TRIAL_DAYS}-day trial. No card needed until you subscribe.
                </p>
              </>
            )}
            {billing?.subscriptionStatus === 'past_due' && (
              <p className="mt-1 text-sm text-red-600">Your last payment didn&apos;t go through. Update your card under Manage billing.</p>
            )}
          </div>
          <div>
            {access === 'subscribed' && (
              <Button variant="outline" onClick={() => go('portal')} disabled={!!loading}>
                {loading === 'portal' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</> : 'Manage billing'}
              </Button>
            )}
            {access === 'trial' && (
              <Button className="bg-[#025CA8] hover:bg-[#024A87]" onClick={() => go('checkout')} disabled={!!loading}>
                {loading === 'checkout' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting…</> : 'Subscribe'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Nightly license checks */}
      <div className="mb-6 rounded-xl border bg-white shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700">Nightly license checks</h2>
        <p className="text-xs text-gray-400 mt-0.5 mb-4">
          {formatMoney(STATE_CENTS)} a month for each state. Every night we compare your people&apos;s licenses in that state
          against the state&apos;s published list. Other states can still be tracked by hand.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {supportedStates.map(s => (
            <label key={s.code} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
              chosen.includes(s.code) ? 'border-[#025CA8] bg-[#025CA8]/5' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input
                type="checkbox"
                checked={chosen.includes(s.code)}
                onChange={e => setChosen(prev => e.target.checked ? [...prev, s.code] : prev.filter(c => c !== s.code))}
                className="accent-[#025CA8]"
              />
              {s.name}
            </label>
          ))}
        </div>
        {statesError && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{statesError}</p>}
        {dirty && (
          <div className="mt-4 flex justify-end">
            <Button onClick={saveStates} disabled={statesSaving} className="bg-[#025CA8] hover:bg-[#024A87]">
              {statesSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save states'}
            </Button>
          </div>
        )}
      </div>

      {/* What it adds up to */}
      <div className="rounded-xl border bg-white shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Your monthly total</h2>
        <dl className="space-y-2 text-sm">
          <Line label="Training Loop" amount={BASE_CENTS} />
          <Line label={`${users} ${users === 1 ? 'person' : 'people'} × ${formatMoney(USER_CENTS)}`} amount={users * USER_CENTS} />
          {chosen.length > 0 && (
            <Line label={`${chosen.length} ${chosen.length === 1 ? 'state' : 'states'} checked nightly × ${formatMoney(STATE_CENTS)}`} amount={chosen.length * STATE_CENTS} />
          )}
          <div className="flex justify-between border-t pt-3 text-base font-semibold text-gray-900">
            <dt>Total</dt><dd className="tabular-nums">{formatMoney(total)}/mo</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-gray-400">
          People are everyone marked active on your Staff page, RBTs and BCBAs alike. Changes are prorated on your next invoice.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Fewer than 10 RBTs and BCBAs, or a non-profit?{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#025CA8] hover:underline">Contact us</a> for a discounted plan.
        </p>
      </div>
    </div>
  )
}

function Line({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between text-gray-600">
      <dt>{label}</dt><dd className="tabular-nums">{formatMoney(amount)}</dd>
    </div>
  )
}
