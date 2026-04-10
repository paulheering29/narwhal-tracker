'use client'

import { Award, Clock, TrendingUp, Users, CalendarDays, Star } from 'lucide-react'

type StaffMember = {
  id: string
  first_name: string
  last_name: string
  display_first_name: string | null
  display_last_name: string | null
  original_certification_date: string
}

type Props = {
  staff: StaffMember[]
  today: string
}

function getDisplayName(s: StaffMember) {
  const first = s.display_first_name || s.first_name
  const last  = s.display_last_name  || s.last_name
  return `${first} ${last}`
}

function daysFromDate(dateStr: string, todayStr: string): number {
  const d1 = new Date(dateStr  + 'T00:00:00').getTime()
  const d2 = new Date(todayStr + 'T00:00:00').getTime()
  return Math.max(0, Math.floor((d2 - d1) / 86400000))
}

function formatTenure(days: number): string {
  const years  = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const parts: string[] = []
  if (years  > 0) parts.push(`${years} yr${years  !== 1 ? 's' : ''}`)
  if (months > 0) parts.push(`${months} mo${months !== 1 ? 's' : ''}`)
  if (parts.length === 0) return '< 1 month'
  return parts.join(', ')
}

function formatTotalTenure(days: number): string {
  const years  = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const parts: string[] = []
  if (years  > 0) parts.push(`${years} yr${years  !== 1 ? 's' : ''}`)
  if (months > 0) parts.push(`${months} mo${months !== 1 ? 's' : ''}`)
  if (parts.length === 0) return '< 1 month total'
  return parts.join(' ')
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

export function RbtInsightsClient({ staff, today }: Props) {
  if (staff.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">RBT Insights</h1>
        <p className="text-gray-400 text-sm">
          No active RBTs with a certification date on record yet. Add original certification
          dates on each RBT&apos;s profile page to see insights here.
        </p>
      </div>
    )
  }

  // Sorted by cert date ascending (oldest = longest tenured, newest = most recent)
  const sorted = [...staff].sort((a, b) =>
    a.original_certification_date.localeCompare(b.original_certification_date)
  )

  const longestTenured = sorted[0]
  const newest         = sorted[sorted.length - 1]

  const longestDays = daysFromDate(longestTenured.original_certification_date, today)
  const newestDays  = daysFromDate(newest.original_certification_date, today)

  const totalDays   = staff.reduce((sum, s) => sum + daysFromDate(s.original_certification_date, today), 0)
  const averageDays = Math.round(totalDays / staff.length)

  const totalYears  = (totalDays / 365).toFixed(1)
  const avgYears    = (averageDays / 365).toFixed(1)

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">RBT Insights</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tenure stats across {staff.length} active RBT{staff.length !== 1 ? 's' : ''} with certification dates on record.
        </p>
      </div>

      {/* Top row: 2 spotlight cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">

        {/* Newest RBT */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 to-blue-100 border border-blue-200 p-6">
          <div className="absolute -right-4 -top-4 opacity-10">
            <Star className="h-32 w-32 text-blue-500" />
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-blue-500 text-white shrink-0">
              <Star className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-widest">Newest RBT</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">{getDisplayName(newest)}</p>
          <p className="text-sm text-blue-700 font-medium mb-3">
            Certified {fmtDate(newest.original_certification_date)}
          </p>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1">
            <Clock className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700">{formatTenure(newestDays)} as RBT</span>
          </div>
        </div>

        {/* Longest Tenured */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 border border-amber-200 p-6">
          <div className="absolute -right-4 -top-4 opacity-10">
            <Award className="h-32 w-32 text-amber-500" />
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-amber-500 text-white shrink-0">
              <Award className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-widest">Longest Tenured RBT</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">{getDisplayName(longestTenured)}</p>
          <p className="text-sm text-amber-700 font-medium mb-3">
            Certified {fmtDate(longestTenured.original_certification_date)}
          </p>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700">{formatTenure(longestDays)} as RBT</span>
          </div>
        </div>
      </div>

      {/* Bottom row: 3 stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">

        {/* Total Time */}
        <div className="rounded-2xl bg-white border border-gray-200 p-6 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-violet-100 shrink-0">
              <TrendingUp className="h-4 w-4 text-violet-600" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Total RBT Tenure</span>
          </div>
          <div>
            <p className="text-4xl font-extrabold text-gray-900">{totalYears}</p>
            <p className="text-sm text-gray-500 mt-0.5">years combined</p>
          </div>
          <p className="text-xs text-gray-400">{formatTotalTenure(totalDays)} across all active RBTs</p>
        </div>

        {/* Average Time */}
        <div className="rounded-2xl bg-white border border-gray-200 p-6 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-emerald-100 shrink-0">
              <Users className="h-4 w-4 text-emerald-600" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Average Tenure</span>
          </div>
          <div>
            <p className="text-4xl font-extrabold text-gray-900">{avgYears}</p>
            <p className="text-sm text-gray-500 mt-0.5">years per RBT</p>
          </div>
          <p className="text-xs text-gray-400">{formatTenure(averageDays)} average across {staff.length} RBT{staff.length !== 1 ? 's' : ''}</p>
        </div>

        {/* RBTs counted */}
        <div className="rounded-2xl bg-white border border-gray-200 p-6 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-teal-100 shrink-0">
              <CalendarDays className="h-4 w-4 text-teal-600" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">RBTs Counted</span>
          </div>
          <div>
            <p className="text-4xl font-extrabold text-gray-900">{staff.length}</p>
            <p className="text-sm text-gray-500 mt-0.5">active RBTs</p>
          </div>
          <p className="text-xs text-gray-400">with original certification date on record</p>
        </div>
      </div>

      {/* Tenure bar chart */}
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Tenure by RBT</h2>
        <div className="space-y-3">
          {sorted.slice().reverse().map(s => {
            const days = daysFromDate(s.original_certification_date, today)
            const pct  = longestDays > 0 ? Math.max(2, Math.round((days / longestDays) * 100)) : 2
            return (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm text-gray-700 font-medium truncate text-right">
                  {getDisplayName(s)}
                </span>
                <div className="flex-1 h-5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#457595] to-[#6fa8c4] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-xs text-gray-500 tabular-nums">
                  {formatTenure(days)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
