'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CircleCheck } from 'lucide-react'
import { InfoTip } from './info-tip'

export type ExpiringItem = {
  id: string
  /** YYYY-MM-DD expiration date, used for the slider filter */
  date: string
  label: string
  sublabel?: string
  href: string
  progress?: { pct: number; status: 'done' | 'scheduled' | 'behind' }
  badge?: { label: string }
}

const MAX_DAYS = 90

export function ExpiringSoonCard({ items }: { items: ExpiringItem[] }) {
  const [days, setDays] = useState(30)
  const router = useRouter()

  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const visible = items.filter(i => i.date <= cutoff).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="h-full rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6 flex flex-col">
      <div className="relative flex items-center justify-center mb-3">
        <AlertTriangle className="absolute left-0 h-5 w-5 text-rose-500" />
        <h3 className="text-base font-bold uppercase tracking-wide text-gray-500">Expiring Soon</h3>
        <InfoTip text="Certifications and state licenses ending within the number of days you pick with the slider (up to 90). Bars show progress toward each person's renewal requirements. Click a name to open their profile." />
      </div>

      <p className="text-6xl font-extrabold leading-none tabular-nums text-rose-600">{visible.length}</p>
      <p className="mt-2 text-sm text-gray-600">
        Certifications and state licenses expiring in the next {days} day{days === 1 ? '' : 's'}
      </p>

      <div className="mt-4">
        <input
          type="range"
          min={1}
          max={MAX_DAYS}
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          aria-label="Days until expiration"
          className="w-full accent-rose-500"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>1 day</span>
          <span>{MAX_DAYS} days</span>
        </div>
      </div>

      <ul className="mt-4 -mx-2 flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100 border-t border-gray-100">
        {visible.length === 0 ? (
          <li className="px-2 py-3 text-sm text-gray-400">Nothing expiring in this window</li>
        ) : (
          visible.map(item => (
            <li
              key={item.id}
              onClick={() => router.push(item.href)}
              className="group flex flex-col px-2 py-2.5 text-sm cursor-pointer rounded-md hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-800 group-hover:text-rose-700">{item.label}</span>
                {item.badge && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <CircleCheck className="h-3 w-3" /> {item.badge.label}
                  </span>
                )}
              </span>
              {item.sublabel && <span className="text-xs text-gray-400">{item.sublabel}</span>}
              {item.progress && (
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      item.progress.status === 'done'      ? 'bg-emerald-500' :
                      item.progress.status === 'scheduled' ? 'bg-emerald-300' :
                                                             'bg-rose-500'
                    }`}
                    style={{ width: `${Math.max(2, item.progress.pct * 100)}%` }}
                  />
                </div>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
