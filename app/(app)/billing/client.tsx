'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, Zap, CheckCheck } from 'lucide-react'
import type { Plan, CompanyBilling } from '@/lib/plans'

type Props = {
  billing: CompanyBilling | null
  allPlans: Plan[]
  rbtCount: number
  formatPrice: (cents: number) => string
}

const PLAN_FEATURES: Record<string, string[]> = {
  free:    ['Up to 5 RBTs', 'Certification cycle tracking', 'Training records & PDUs', 'Analytics & topic matrix', 'PDF certificate generation'],
  starter: ['Up to 50 RBTs', 'Everything in Free', 'Certificate emails on confirmation', 'Day-before training reminders', 'Basic file storage (5 GB)'],
  pro:     ['Up to 100 RBTs', 'Everything in Starter', 'More file storage (20 GB)', 'Priority support'],
}

export function BillingClient({ billing, allPlans, rbtCount, formatPrice }: Props) {
  const searchParams = useSearchParams()
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [justUpgraded, setJustUpgraded] = useState(false)

  useEffect(() => {
    if (searchParams.get('success') === 'true') setJustUpgraded(true)
  }, [searchParams])

  const currentPlan = billing?.plan
  const isFreePlan  = !currentPlan || currentPlan.name === 'free'

  async function handleUpgrade(planName: string) {
    setLoadingPlan(planName)
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planName }),
    })
    const { url, error } = await res.json()
    if (error) { alert(error); setLoadingPlan(null); return }
    window.location.href = url
  }

  async function handleManageBilling() {
    setLoadingPortal(true)
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const { url, error } = await res.json()
    if (error) { alert(error); setLoadingPortal(false); return }
    window.location.href = url
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Billing & Plan</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your subscription and see what&apos;s included.</p>
      </div>

      {/* Success banner */}
      {justUpgraded && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
          <CheckCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800 font-medium">You&apos;re all set! Your plan has been upgraded.</p>
        </div>
      )}

      {/* Current plan summary */}
      <div className="mb-10 rounded-xl border bg-white shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Current Plan</p>
            <p className="text-2xl font-bold text-gray-900">{currentPlan?.display_name ?? 'Free'}</p>
            <p className="mt-1 text-sm text-gray-500">
              {rbtCount} / {currentPlan?.max_rbts ?? 5} RBTs used
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isFreePlan && (
              <Button variant="outline" onClick={handleManageBilling} disabled={loadingPortal}>
                {loadingPortal ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</> : 'Manage Billing'}
              </Button>
            )}
            {isFreePlan && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
                Free forever
              </span>
            )}
          </div>
        </div>

        {/* RBT usage bar */}
        <div className="mt-5">
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (rbtCount / (currentPlan?.max_rbts ?? 5)) * 100)}%`,
                backgroundColor: rbtCount >= (currentPlan?.max_rbts ?? 5) ? '#ef4444' : '#457595',
              }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">{rbtCount} of {currentPlan?.max_rbts ?? 5} RBTs</p>
        </div>
      </div>

      {/* Plan comparison */}
      <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
        <Zap className="h-5 w-5 text-amber-500" /> All Plans
      </h2>
      <div className="grid gap-5 sm:grid-cols-3">
        {allPlans.map(plan => {
          const isCurrent = plan.id === currentPlan?.id || (isFreePlan && plan.name === 'free')
          const features  = PLAN_FEATURES[plan.name] ?? []

          return (
            <div
              key={plan.id}
              className={`rounded-2xl border-2 p-6 flex flex-col ${
                isCurrent ? 'border-[#457595] bg-blue-50/30' : 'border-gray-200 bg-white'
              }`}
            >
              {isCurrent && (
                <div className="mb-3 self-start inline-flex items-center rounded-full bg-[#457595] px-2.5 py-0.5 text-xs font-medium text-white">
                  Current plan
                </div>
              )}
              <div className="text-lg font-bold text-gray-900 mb-1">{plan.display_name}</div>
              <div className="text-3xl font-extrabold mb-5" style={{ color: '#457595' }}>
                {formatPrice(plan.price_monthly)}
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <Button variant="outline" disabled className="w-full">Current plan</Button>
              ) : plan.name === 'free' ? (
                <Button variant="outline" disabled className="w-full">Downgrade via support</Button>
              ) : (
                <Button
                  className="w-full"
                  style={{ backgroundColor: '#457595' }}
                  onClick={() => handleUpgrade(plan.name)}
                  disabled={!!loadingPlan}
                >
                  {loadingPlan === plan.name
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting…</>
                    : `Upgrade to ${plan.display_name}`}
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
