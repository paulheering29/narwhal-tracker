import { Users } from 'lucide-react'

type Slice = { label: string; count: number; color: string }

// Pure SVG donut: no chart dependency needed for two slices.
export function DonutCard({ title, subtitle, centerLabel = 'total staff', slices }: {
  title: string
  /** Small line under the title, e.g. which group the card covers */
  subtitle?: string
  centerLabel?: string
  slices: Slice[]
}) {
  const total = slices.reduce((n, s) => n + s.count, 0)
  const R = 70
  const C = 2 * Math.PI * R
  let offset = 0

  return (
    <div className="rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6 flex flex-col">
      <div className="relative flex items-center justify-center mb-4">
        <Users className="absolute left-0 h-5 w-5 text-blue-500" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">{title}</h3>
      </div>
      {subtitle && <p className="-mt-3 mb-3 text-center text-xs text-gray-400">{subtitle}</p>}

      <div className="relative mx-auto h-48 w-48">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          {total > 0 && slices.map(s => {
            const len = (s.count / total) * C
            const el = (
              <circle
                key={s.label}
                cx="90" cy="90" r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="26"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              />
            )
            offset += len
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-extrabold tabular-nums text-gray-900">{total}</span>
          <span className="max-w-[5.5rem] text-center text-xs leading-tight text-gray-500">{centerLabel}</span>
        </div>
      </div>

      <ul className="mt-5 space-y-2">
        {slices.map(s => (
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
