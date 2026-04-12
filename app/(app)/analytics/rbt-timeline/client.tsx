'use client'

import { useState } from 'react'
import { getDisplayName } from '@/lib/display-name'

type StaffMember = {
  id: string
  first_name: string
  last_name: string
  display_first_name: string | null
  display_last_name: string | null
  original_certification_date: string
}

type Comparison = {
  name: string
  year: number
  value: string
  image_url: string | null
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

export function RbtTimelineClient({ staff, comparisons }: { staff: StaffMember[]; comparisons: Comparison[] }) {
  const [selectedComparison, setSelectedComparison] = useState<string>('none')

  // Group staff by year
  const byYear = new Map<number, StaffMember[]>()
  for (const s of staff) {
    const year = new Date(s.original_certification_date + 'T00:00:00').getFullYear()
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(s)
  }

  const rawYears = Array.from(byYear.keys()).sort((a, b) => a - b)
  const minYear = rawYears[0]
  const maxYear = rawYears[rawYears.length - 1]
  const years: number[] = []
  for (let y = minYear; y <= maxYear; y++) years.push(y)

  if (years.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">RBT Timeline</h1>
        <p className="text-sm text-gray-400">No RBTs with a certification date on record yet.</p>
      </div>
    )
  }

  // Unique category names from comparisons table
  const comparisonNames = Array.from(new Set(comparisons.map(c => c.name)))

  // Build lookup for selected comparison: year → { value, image_url }
  const comparisonByYear = new Map<number, { value: string; image_url: string | null }>()
  if (selectedComparison !== 'none') {
    for (const c of comparisons) {
      if (c.name === selectedComparison && c.year >= minYear && c.year <= maxYear) {
        comparisonByYear.set(c.year, { value: c.value, image_url: c.image_url })
      }
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">RBT Timeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            {staff.length} RBT{staff.length !== 1 ? 's' : ''} certified across {years.length} year{years.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Comparison dropdown */}
        {comparisonNames.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-sm text-gray-500 whitespace-nowrap">Also show:</label>
            <select
              value={selectedComparison}
              onChange={e => setSelectedComparison(e.target.value)}
              className="text-sm rounded-md border border-gray-200 bg-white px-3 py-1.5 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="none">None</option>
              {comparisonNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Scrollable timeline container */}
      <div className="overflow-x-auto pb-6">
        <div style={{ minWidth: Math.max(years.length * 180, 600) }}>

          {/* Name cards above the line */}
          <div className="flex items-end mb-0" style={{ paddingBottom: 0 }}>
            {years.map((year, i) => {
              const color = DOT_COLORS[i % DOT_COLORS.length]
              const members = byYear.get(year) ?? []
              const isEmpty = members.length === 0
              return (
                <div
                  key={year}
                  className="flex-1 flex flex-col items-center px-2"
                >
                  {isEmpty ? (
                    <div className="w-full max-w-[160px] rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3 flex items-center justify-center">
                      <span className="text-xs text-gray-300">—</span>
                    </div>
                  ) : (
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
                  )}

                  {/* Connector line from card to dot */}
                  <div className="w-px bg-gray-200" style={{ height: 28 }} />
                </div>
              )
            })}
          </div>

          {/* Timeline line + dots */}
          <div className="relative flex items-center" style={{ height: 48 }}>
            <div
              className="absolute inset-y-1/2 left-0 right-0 h-1 rounded-full -translate-y-1/2"
              style={{
                background: `linear-gradient(to right, ${DOT_COLORS[0].line}, ${DOT_COLORS[Math.min(DOT_COLORS.length - 1, years.length - 1) % DOT_COLORS.length].line})`,
              }}
            />
            {years.map((year, i) => {
              const color = DOT_COLORS[i % DOT_COLORS.length]
              return (
                <div key={year} className="flex-1 flex justify-center relative z-10">
                  <div className={`w-5 h-5 rounded-full border-4 border-white shadow-md ${color.bg}`} />
                </div>
              )
            })}
          </div>

          {/* Year labels */}
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

          {/* Comparison row */}
          {selectedComparison !== 'none' && (
            <div className="flex mt-5 border-t border-gray-100 pt-5">
              {years.map(year => {
                const entry = comparisonByYear.get(year)
                return (
                  <div key={year} className="flex-1 px-2 flex flex-col items-center text-center">
                    {entry ? (
                      <div className="w-full max-w-[160px] rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                        {entry.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={entry.image_url}
                            alt={entry.value}
                            className="w-full aspect-square object-cover"
                          />
                        )}
                        <p className="text-xs text-gray-700 leading-snug px-3 py-2">
                          {entry.value}
                        </p>
                      </div>
                    ) : (
                      <div className="w-full max-w-[160px] rounded-xl border border-dashed border-gray-100 bg-gray-50 px-3 py-2.5 flex items-center justify-center">
                        <span className="text-xs text-gray-200">—</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Comparison label */}
          {selectedComparison !== 'none' && (
            <div className="mt-3 text-center text-lg font-medium text-gray-600">{selectedComparison}</div>
          )}

        </div>
      </div>
    </div>
  )
}
