import type { ReactNode } from 'react'
import { Users } from 'lucide-react'
import { InfoTip } from './info-tip'

// Semicircle gauge: a colored arc filled to `pct` (0-1) of the half circle.
// Plain SVG, same as the donut.
export function GaugeCard({ title, info, pct, hasData, caption, legend }: {
  title: ReactNode
  info: string
  pct: number
  hasData: boolean
  caption: string
  legend: { label: string; count: number; color: string }[]
}) {
  const R = 80
  const half = Math.PI * R
  const filled = hasData ? Math.max(0, Math.min(1, pct)) * half : 0
  // Left-to-right half circle through the top.
  const arc = `M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`

  return (
    <div className="rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6 flex flex-col">
      <div className="relative flex items-center justify-center mb-4">
        <Users className="absolute left-0 h-5 w-5 text-blue-500" />
        <h3 className="text-base font-bold uppercase tracking-wide text-gray-500">{title}</h3>
        <InfoTip text={info} />
      </div>

      <div className="relative mx-auto w-56">
        <svg viewBox="0 0 200 110" className="w-full">
          {/* No track on purpose: the unfilled part should look absent in both themes */}
          {filled > 0 && (
            <path
              d={arc}
              fill="none"
              stroke="#10b981"
              strokeWidth="22"
              strokeDasharray={`${filled} ${half}`}
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-4xl font-extrabold tabular-nums text-gray-900">
            {hasData ? `${Math.round(pct * 100)}%` : '—'}
          </span>
          <span className="text-xs text-gray-500">{caption}</span>
        </div>
      </div>

      <ul className="mt-5 space-y-2">
        {legend.map(s => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-medium text-gray-800">{s.label}</span>
            <span className="ml-auto tabular-nums text-gray-500">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
