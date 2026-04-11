'use client'

import { getDisplayName } from '@/lib/display-name'

type StaffMember = {
  id: string
  first_name: string
  last_name: string
  display_first_name: string | null
  display_last_name: string | null
  original_certification_date: string
}

const DOT_COLORS = [
  { bg: 'bg-violet-400',  border: 'border-violet-400',  text: 'text-violet-600',  line: '#a78bfa' },
  { bg: 'bg-teal-400',    border: 'border-teal-400',    text: 'text-teal-600',    line: '#2dd4bf' },
  { bg: 'bg-green-400',   border: 'border-green-400',   text: 'text-green-600',   line: '#4ade80' },
  { bg: 'bg-amber-400',   border: 'border-amber-400',   text: 'text-amber-600',   line: '#fbbf24' },
  { bg: 'bg-orange-400',  border: 'border-orange-400',  text: 'text-orange-600',  line: '#fb923c' },
  { bg: 'bg-pink-400',    border: 'border-pink-400',    text: 'text-pink-600',    line: '#f472b6' },
  { bg: 'bg-blue-400',    border: 'border-blue-400',    text: 'text-blue-600',    line: '#60a5fa' },
]

export function RbtTimelineClient({ staff }: { staff: StaffMember[] }) {
  // Group by year
  const byYear = new Map<number, StaffMember[]>()
  for (const s of staff) {
    const year = new Date(s.original_certification_date + 'T00:00:00').getFullYear()
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(s)
  }

  const years = Array.from(byYear.keys()).sort((a, b) => a - b)

  if (years.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">RBT Timeline</h1>
        <p className="text-sm text-gray-400">No RBTs with a certification date on record yet.</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">RBT Timeline</h1>
        <p className="mt-1 text-sm text-gray-500">
          {staff.length} RBT{staff.length !== 1 ? 's' : ''} certified across {years.length} year{years.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Scrollable timeline container */}
      <div className="overflow-x-auto pb-6">
        <div style={{ minWidth: Math.max(years.length * 180, 600) }}>

          {/* Name cards above the line */}
          <div className="flex items-end mb-0" style={{ paddingBottom: 0 }}>
            {years.map((year, i) => {
              const color = DOT_COLORS[i % DOT_COLORS.length]
              const members = byYear.get(year)!
              return (
                <div
                  key={year}
                  className="flex-1 flex flex-col items-center px-2"
                >
                  {/* Card */}
                  <div className="w-full max-w-[160px] rounded-xl border bg-white shadow-sm px-3 pt-3 pb-4 relative">
                    {/* Notch at bottom */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full w-0 h-0"
                      style={{
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        borderTop: '8px solid #e5e7eb',
                      }}
                    />
                    <div
                      className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-[calc(100%-1px)] w-0 h-0"
                      style={{
                        borderLeft: '7px solid transparent',
                        borderRight: '7px solid transparent',
                        borderTop: '7px solid white',
                      }}
                    />

                    {/* Count badge */}
                    <div className={`mb-2 self-start inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color.text} bg-opacity-10`}
                      style={{ backgroundColor: `${color.line}22` }}>
                      {members.length} RBT{members.length !== 1 ? 's' : ''}
                    </div>

                    {/* Names */}
                    <ul className="space-y-0.5">
                      {members.map(s => (
                        <li key={s.id} className="text-xs text-gray-700 font-medium leading-snug truncate">
                          {getDisplayName(s)}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Connector line from card to dot */}
                  <div className="w-px bg-gray-200" style={{ height: 28 }} />
                </div>
              )
            })}
          </div>

          {/* Timeline line + dots */}
          <div className="relative flex items-center" style={{ height: 48 }}>
            {/* Full-width gradient line */}
            <div
              className="absolute inset-y-1/2 left-0 right-0 h-1 rounded-full -translate-y-1/2"
              style={{
                background: `linear-gradient(to right, ${DOT_COLORS[0].line}, ${DOT_COLORS[Math.min(DOT_COLORS.length - 1, years.length - 1) % DOT_COLORS.length].line})`,
              }}
            />

            {/* Dots */}
            {years.map((year, i) => {
              const color = DOT_COLORS[i % DOT_COLORS.length]
              return (
                <div key={year} className="flex-1 flex justify-center relative z-10">
                  <div
                    className={`w-5 h-5 rounded-full border-4 border-white shadow-md ${color.bg}`}
                  />
                </div>
              )
            })}
          </div>

          {/* Year labels below dots */}
          <div className="flex mt-2">
            {years.map((year, i) => {
              const color = DOT_COLORS[i % DOT_COLORS.length]
              return (
                <div key={year} className={`flex-1 text-center text-sm font-bold ${color.text}`}>
                  {year}
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </div>
  )
}
