'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

export type CalendarTraining = { id: string; name: string; date: string; startTime: string | null }

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function fmtTime(t: string | null) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`
}

export function CalendarCard({ trainings }: { trainings: CalendarTraining[] }) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(null)

  const byDate = new Map<string, CalendarTraining[]>()
  for (const t of trainings) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t])

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth  = new Date(year, month + 1, 0).getDate()
  const todayKey     = ymd(now.getFullYear(), now.getMonth(), now.getDate())

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setSelected(null)
  }

  const selectedTrainings = selected ? (byDate.get(selected) ?? []) : []

  return (
    <div className="rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6 flex flex-col">
      <div className="relative flex items-center justify-center mb-4">
        <CalendarDays className="absolute left-0 h-5 w-5 text-emerald-500" />
        <h3 className="text-base font-bold uppercase tracking-wide text-gray-500">Calendar</h3>
      </div>

      <div className="flex items-center justify-between mb-2">
        <button onClick={() => shift(-1)} aria-label="Previous month" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => shift(1)} aria-label="Next month" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-gray-400">
        {WEEKDAYS.map((d, i) => <div key={i} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 text-center text-sm">
        {Array.from({ length: firstWeekday }, (_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const key = ymd(year, month, day)
          const has = byDate.has(key)
          const isToday = key === todayKey
          const content = (
            <>
              <span className={isToday ? 'flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-white' : 'text-gray-700'}>{day}</span>
              <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${has ? 'bg-emerald-500' : ''}`} />
            </>
          )
          return has ? (
            <button
              key={key}
              onClick={() => setSelected(s => (s === key ? null : key))}
              className={`flex flex-col items-center py-1 rounded-md hover:bg-gray-50 ${selected === key ? 'bg-emerald-50' : ''}`}
              aria-label={`${byDate.get(key)!.length} training(s) on ${key}`}
            >
              {content}
            </button>
          ) : (
            <div key={key} className="flex flex-col items-center py-1">{content}</div>
          )
        })}
      </div>

      {selected && (
        <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
          {selectedTrainings.map(t => (
            <li key={t.id}>
              <Link href={`/trainings/${t.id}`} className="block px-1 py-2 text-sm hover:bg-gray-50 rounded-md">
                <span className="font-medium text-gray-800">{t.name}</span>
                {t.startTime && <span className="block text-xs text-gray-400">{fmtTime(t.startTime)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
