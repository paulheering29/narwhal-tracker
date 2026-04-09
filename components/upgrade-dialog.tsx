'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Zap, CheckCircle2 } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlan: string
  currentRbts: number
  maxRbts: number
}

const PLANS = [
  {
    name: 'starter',
    label: 'Starter',
    price: '$25/mo',
    maxRbts: 50,
    features: ['Up to 50 RBTs', 'Automatic certificate emails', 'Day-before training reminders', 'Basic file storage'],
  },
  {
    name: 'pro',
    label: 'Pro',
    price: '$50/mo',
    maxRbts: 100,
    features: ['Up to 100 RBTs', 'Automatic certificate emails', 'Day-before training reminders', 'More file storage'],
  },
]

export function UpgradeDialog({ open, onOpenChange, currentPlan, currentRbts, maxRbts }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  async function handleUpgrade(planName: string) {
    setLoading(planName)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planName }),
      })
      const { url, error } = await res.json()
      if (error) { alert(error); setLoading(null); return }
      window.location.href = url
    } catch {
      alert('Something went wrong. Please try again.')
      setLoading(null)
    }
  }

  const availablePlans = PLANS.filter(p => p.name !== currentPlan)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Upgrade your plan
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <p className="text-sm text-gray-500 mb-6">
            You&apos;ve reached the <span className="font-medium text-gray-900">{currentRbts}/{maxRbts} RBT limit</span> on
            your <span className="font-medium text-gray-900">{currentPlan}</span> plan.
            Upgrade to add more team members.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {availablePlans.map(plan => (
              <div
                key={plan.name}
                className={`rounded-xl border-2 p-5 ${plan.name === 'pro' ? 'border-[#457595]' : 'border-gray-200'}`}
              >
                {plan.name === 'pro' && (
                  <div className="mb-3 inline-flex items-center rounded-full bg-[#457595] px-2.5 py-0.5 text-xs font-medium text-white">
                    Most popular
                  </div>
                )}
                <div className="mb-1 text-lg font-bold text-gray-900">{plan.label}</div>
                <div className="mb-4 text-2xl font-extrabold" style={{ color: '#457595' }}>{plan.price}</div>
                <ul className="mb-5 space-y-2">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  style={{ backgroundColor: '#457595' }}
                  onClick={() => handleUpgrade(plan.name)}
                  disabled={!!loading}
                >
                  {loading === plan.name
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting…</>
                    : `Upgrade to ${plan.label}`}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
