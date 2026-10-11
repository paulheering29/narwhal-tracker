'use client'

import { useState } from 'react'
import { formatMoney, monthlyTotalCents, type Rates } from '@/lib/pricing'

// Empty is allowed while typing, so the field can be cleared and retyped; it counts as 0.
const toCount = (v: string, max: number) => Math.min(max, Math.max(0, parseInt(v, 10) || 0))

export function PriceCalculator({ color, rates }: { color: string; rates: Rates }) {
  const [people, setPeople] = useState('20')
  const [states, setStates] = useState('0')

  const p = toCount(people, 10000)
  const s = toCount(states, 50)

  return (
    <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8">
      <h3 className="font-semibold text-lg mb-6">Estimate your price</h3>
      <div className="grid gap-8 sm:grid-cols-2 sm:items-center">
        <div className="space-y-5">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1.5">Total people in Training Loop</span>
            <input
              type="number" inputMode="numeric" min={0} value={people}
              onChange={e => setPeople(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-[#025CA8]"
            />
            <span className="block text-xs text-gray-500 mt-1.5">
              Count everyone: RBTs, BCBAs, training coordinators, and admins.
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1.5">States for nightly license checks</span>
            <input
              type="number" inputMode="numeric" min={0} value={states}
              onChange={e => setStates(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-[#025CA8]"
            />
          </label>
        </div>

        <div className="rounded-xl bg-gray-50 p-6" aria-live="polite">
          <dl className="space-y-1.5 text-sm text-gray-600 mb-4">
            <Row label="Training Loop" amount={rates.baseCents} />
            <Row label={`${p} ${p === 1 ? 'person' : 'people'} × ${formatMoney(rates.userCents)}`} amount={p * rates.userCents} />
            {s > 0 && <Row label={`${s} ${s === 1 ? 'state' : 'states'} × ${formatMoney(rates.stateCents)}`} amount={s * rates.stateCents} />}
          </dl>
          <p className="border-t border-gray-200 pt-4">
            <span className="text-4xl font-extrabold tabular-nums" style={{ color }}>{formatMoney(monthlyTotalCents(p, s, rates))}</span>
            <span className="text-gray-500"> / month</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt><dd className="tabular-nums">{formatMoney(amount)}</dd>
    </div>
  )
}
