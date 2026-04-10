'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Clock, ExternalLink, CheckCircle2, Circle } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import type { RawCourse } from './page'

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffPerson = {
  id: string
  first_name: string
  last_name: string
  display_first_name: string | null
  display_last_name: string | null
}

type Attendee = {
  id: string
  confirmed: boolean
  staff: StaffPerson | null
}

type Course = {
  id: string
  name: string
  date: string
  start_time: string | null
  end_time: string | null
  modality: string | null
  units: number | null
  records: Attendee[]
}

type Props = {
  rawCourses: RawCourse[]
  year: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const DOW = ['S','M','T','W','T','F','S']

// Full cell background when a training falls on that day
const MODALITY_CELL: Record<string, string> = {
  'in-person':           'bg-emerald-100 hover:bg-emerald-200 text-emerald-900',
  'online-synchronous':  'bg-blue-100 hover:bg-blue-200 text-blue-900',
  'online-asynchronous': 'bg-violet-100 hover:bg-violet-200 text-violet-900',
}
// Mixed modalities on same day
const CELL_MULTI = 'bg-amber-100 hover:bg-amber-200 text-amber-900'
const CELL_OTHER = 'bg-gray-200 hover:bg-gray-300 text-gray-800'

const MODALITY_LABEL: Record<string, string> = {
  'in-person':           'In-person',
  'online-synchronous':  'Online sync',
  'online-asynchronous': 'Online async',
}

const MODALITY_BADGE: Record<string, string> = {
  'in-person':           'bg-emerald-100 text-emerald-700',
  'online-synchronous':  'bg-blue-100 text-blue-700',
  'online-asynchronous': 'bg-violet-100 text-violet-700',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDisplayName(s: StaffPerson): string {
  return `${s.display_first_name || s.first_name} ${s.display_last_name || s.last_name}`
}

function unwrapStaff(raw: RawCourse['training_records'][number]['staff']): StaffPerson | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

function normalizeCourses(raw: RawCourse[]): Course[] {
  return raw.map(c => ({
    id:         c.id,
    name:       c.name,
    date:       c.date,
    start_time: c.start_time,
    end_time:   c.end_time,
    modality:   c.modality,
    units:      c.units,
    records:    (c.training_records ?? []).map(r => ({
      id:        r.id,
      confirmed: r.confirmed,
      staff:     unwrapStaff(r.staff),
    } as Attendee)),
  }))
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDow(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function fmtTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtSheetDate(year: number, month: number, day: number): string {
  return new Date(year, month, day).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

// ─── Mini-month component ─────────────────────────────────────────────────────

function MonthGrid({
  year, month, coursesByDate, today,
  onDayClick,
}: {
  year: number
  month: number
  coursesByDate: Map<string, Course[]>
  today: string
  onDayClick: (dateKey: string) => void
}) {
  const days      = getDaysInMonth(year, month)
  const firstDow  = getFirstDow(year, month)
  const trainingCount = Array.from({ length: days }, (_, i) => {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    return coursesByDate.has(key)
  }).filter(Boolean).length

  // Build weeks: array of 7-element rows (null = padding)
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ]
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Month header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: '#457595' }}>
        <span className="text-sm font-bold text-white tracking-wide uppercase">
          {MONTH_NAMES[month]}
        </span>
        {trainingCount > 0 && (
          <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-white/25 px-1.5 text-xs font-bold text-white">
            {trainingCount}
          </span>
        )}
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DOW.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-gray-400 py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="p-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              if (!day) return <div key={di} />
              const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dayTrainings = coursesByDate.get(key) ?? []
              const hasTraining  = dayTrainings.length > 0
              const isToday      = key === today
              const isFuture     = key > today

              // Pick cell background colour
              const modalities = Array.from(new Set(dayTrainings.map(c => c.modality ?? '')))
              const cellBg = !hasTraining
                ? ''
                : modalities.length > 1
                  ? CELL_MULTI
                  : (MODALITY_CELL[modalities[0]] ?? CELL_OTHER)

              return (
                <button
                  key={di}
                  onClick={() => hasTraining && onDayClick(key)}
                  className={`
                    relative flex items-center justify-center rounded-lg text-[11px] font-medium transition-colors
                    aspect-square w-full
                    ${hasTraining ? `cursor-pointer ${cellBg}` : 'cursor-default'}
                    ${!hasTraining && isFuture ? 'text-gray-400' : ''}
                    ${!hasTraining && !isFuture ? 'text-gray-700' : ''}
                    ${isToday ? 'ring-2 ring-inset ring-[#457595] font-bold' : ''}
                  `}
                >
                  {day}
                  {/* Count badge for multiple trainings */}
                  {dayTrainings.length > 1 && (
                    <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold opacity-60 leading-none">
                      {dayTrainings.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TrainingCalendarClient({ rawCourses, year }: Props) {
  const router = useRouter()
  const courses = normalizeCourses(rawCourses)

  const today = new Date().toISOString().split('T')[0]

  // Group courses by date
  const coursesByDate = new Map<string, Course[]>()
  for (const c of courses) {
    if (!c.date) continue
    if (!coursesByDate.has(c.date)) coursesByDate.set(c.date, [])
    coursesByDate.get(c.date)!.push(c)
  }

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const selectedCourses = selectedDate ? (coursesByDate.get(selectedDate) ?? []) : []

  // Parse selected date for display
  const selectedParts = selectedDate
    ? { year: parseInt(selectedDate.slice(0, 4)), month: parseInt(selectedDate.slice(5, 7)) - 1, day: parseInt(selectedDate.slice(8, 10)) }
    : null

  const totalTrainings = courses.length

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Training Calendar</h1>
          <p className="mt-1 text-sm text-gray-500">
            {totalTrainings} training{totalTrainings !== 1 ? 's' : ''} in {year}
          </p>
        </div>

        {/* Year navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/analytics/training-calendar?year=${year - 1}`)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-bold text-gray-800 w-14 text-center">{year}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/analytics/training-calendar?year=${year + 1}`)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-6 flex-wrap">
        {Object.entries(MODALITY_LABEL).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`h-4 w-4 rounded ${MODALITY_CELL[key]?.split(' ')[0] ?? 'bg-gray-200'}`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded bg-amber-100" />
          <span className="text-xs text-gray-500">Multiple trainings</span>
        </div>
      </div>

      {/* 3 × 4 month grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, i) => (
          <MonthGrid
            key={i}
            year={year}
            month={i}
            coursesByDate={coursesByDate}
            today={today}
            onDayClick={setSelectedDate}
          />
        ))}
      </div>

      {/* Day detail sheet */}
      <Sheet open={!!selectedDate} onOpenChange={open => { if (!open) setSelectedDate(null) }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {selectedParts ? fmtSheetDate(selectedParts.year, selectedParts.month, selectedParts.day) : ''}
            </SheetTitle>
          </SheetHeader>

          <div className="px-6 py-5 space-y-6">
            {selectedCourses.map(c => {
              const isFuture = (c.date ?? '') > today
              const confirmed   = c.records.filter(r => r.confirmed)
              const unconfirmed = c.records.filter(r => !r.confirmed)

              return (
                <div key={c.id} className="rounded-xl border border-gray-200 overflow-hidden">
                  {/* Training header */}
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm leading-snug">{c.name}</p>
                        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                          {c.start_time && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="h-3 w-3" />
                              {fmtTime(c.start_time)}{c.end_time ? `–${fmtTime(c.end_time)}` : ''}
                            </span>
                          )}
                          {c.modality && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${MODALITY_BADGE[c.modality] ?? 'bg-gray-100 text-gray-600'}`}>
                              {MODALITY_LABEL[c.modality] ?? c.modality}
                            </span>
                          )}
                          {c.units != null && (
                            <span className="text-xs text-gray-400">{c.units} PDU{c.units !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/trainings/${c.id}`}
                        className="shrink-0 flex items-center gap-1 text-xs font-medium text-[#457595] hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>

                  {/* Attendees */}
                  <div className="px-4 py-3">
                    {c.records.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No attendees recorded yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {/* Confirmed / Attended */}
                        {confirmed.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                              {isFuture ? 'Registered' : 'Attended'} · {confirmed.length}
                            </p>
                            <ul className="space-y-1">
                              {confirmed.map(r => (
                                <li key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                  {r.staff ? getDisplayName(r.staff) : <span className="text-gray-400 italic">Unknown</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Unconfirmed / Pending */}
                        {unconfirmed.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                              {isFuture ? 'Invited' : 'Unconfirmed'} · {unconfirmed.length}
                            </p>
                            <ul className="space-y-1">
                              {unconfirmed.map(r => (
                                <li key={r.id} className="flex items-center gap-2 text-sm text-gray-500">
                                  <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                                  {r.staff ? getDisplayName(r.staff) : <span className="italic">Unknown</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
