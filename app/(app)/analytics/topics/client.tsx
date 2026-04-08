'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, CalendarDays, Clock, User, BookOpen, Loader2, BadgeCheck, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Status = 'completed' | 'scheduled' | 'none'

export type TrainingDetail = {
  name: string; date: string | null
  start_time: string | null; end_time: string | null; trainer: string
}

export type MatrixCell = {
  status: Status; training?: TrainingDetail
}

export type AvailableTraining = {
  id: string; topic_id: string; name: string
  date: string | null; start_time: string | null; end_time: string | null; trainer: string
}

type Topic = { id: string; name: string }
type StaffMember = {
  id: string; first_name: string; last_name: string
  display_first_name: string | null; display_last_name: string | null
  cycle_end_date: string | null
}

interface Props {
  topics:             Topic[]
  staff:              StaffMember[]
  matrix:             Record<string, Record<string, MatrixCell>>
  availableTrainings: AvailableTraining[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_WEIGHT: Record<Status, number> = {
  completed: 2, scheduled: 1, none: 0,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayName(s: StaffMember) {
  const first = s.display_first_name?.trim() || s.first_name
  const last  = s.display_last_name?.trim()  || s.last_name
  return `${first} ${last}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtShortDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y.slice(2)}`
}

function fmtTime(t: string | null) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function TrainingTooltip({ detail, status }: { detail: TrainingDetail; status: Status }) {
  const startFmt = fmtTime(detail.start_time)
  const endFmt   = fmtTime(detail.end_time)
  const timeStr  = startFmt && endFmt ? `${startFmt} – ${endFmt}` : startFmt ?? null
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none w-64">
      <div className="relative bg-gray-900 text-white rounded-xl shadow-2xl overflow-hidden">
        <div className={`h-1 w-full ${status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-start gap-2">
            <BookOpen className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
            <span className="text-sm font-semibold leading-snug">{detail.name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <CalendarDays className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            {fmtDate(detail.date)}
          </div>
          {timeStr && (
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              {timeStr}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            {detail.trainer}
          </div>
        </div>
      </div>
      <div className="flex justify-center">
        <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-gray-900" />
      </div>
    </div>
  )
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

type SortState = { topicId: string; dir: 'asc' | 'desc' }

function SortIcon({ id, sort }: { id: string; sort: SortState }) {
  if (sort.topicId !== id) return <ChevronsUpDown className="h-3.5 w-3.5 text-white/50 shrink-0" />
  return sort.dir === 'asc'
    ? <ChevronUp   className="h-3.5 w-3.5 text-white shrink-0" />
    : <ChevronDown className="h-3.5 w-3.5 text-white shrink-0" />
}

// ── Main component ────────────────────────────────────────────────────────────

type SignupTarget = {
  staff:    StaffMember
  training: AvailableTraining
}

export function TopicAnalysisClient({ topics, staff, matrix, availableTrainings }: Props) {
  const supabase = createClient()

  const [sort,          setSort]          = useState<SortState>({ topicId: 'name', dir: 'asc' })
  const [signupTarget,  setSignupTarget]  = useState<SignupTarget | null>(null)
  const [signing,       setSigning]       = useState(false)
  const [signupError,   setSignupError]   = useState<string | null>(null)
  // Track newly signed-up (staff_id + course_id) so UI updates immediately without re-fetch
  const [justSigned,    setJustSigned]    = useState<Set<string>>(new Set())

  if (topics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed flex items-center justify-center py-16 text-sm text-gray-400">
        No topics yet. Add topics in the Admin → Topics tab, then assign them to trainings.
      </div>
    )
  }

  // Pre-build: topicId → soonest upcoming training (for sign-up candidates)
  // We keep all per-topic trainings so we can check against each staff member's expiry
  const trainingsByTopic: Record<string, AvailableTraining[]> = {}
  for (const t of availableTrainings) {
    if (!trainingsByTopic[t.topic_id]) trainingsByTopic[t.topic_id] = []
    trainingsByTopic[t.topic_id].push(t)
  }

  // Given a staff member + topic, find the soonest training that falls before their cycle expiry
  function findSignupTraining(s: StaffMember, topicId: string): AvailableTraining | null {
    const candidates = trainingsByTopic[topicId] ?? []
    for (const t of candidates) {                   // already sorted by date asc from server
      if (!t.date) continue
      if (s.cycle_end_date && t.date > s.cycle_end_date) continue   // after expiry — skip
      const signedKey = `${s.id}:${t.id}`
      if (justSigned.has(signedKey)) continue        // already signed up this session
      return t
    }
    return null
  }

  // ── Sort rows ─────────────────────────────────────────────────────────────
  const sorted = [...staff].sort((a, b) => {
    let cmp = 0
    if (sort.topicId === 'name') {
      cmp = displayName(a).localeCompare(displayName(b))
    } else if (sort.topicId === 'cycle') {
      if (!a.cycle_end_date && !b.cycle_end_date) cmp = 0
      else if (!a.cycle_end_date) cmp = 1
      else if (!b.cycle_end_date) cmp = -1
      else cmp = a.cycle_end_date.localeCompare(b.cycle_end_date)
    } else {
      const wa = STATUS_WEIGHT[matrix[a.id]?.[sort.topicId]?.status ?? 'none']
      const wb = STATUS_WEIGHT[matrix[b.id]?.[sort.topicId]?.status ?? 'none']
      cmp = wb - wa
    }
    return sort.dir === 'asc' ? cmp : -cmp
  })

  function handleSort(id: string) {
    setSort(prev =>
      prev.topicId === id
        ? { topicId: id, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { topicId: id, dir: 'asc' }
    )
  }

  // ── Confirm sign-up ───────────────────────────────────────────────────────
  async function handleConfirmSignup() {
    if (!signupTarget) return
    setSigning(true)
    setSignupError(null)
    const companyId = await getCompanyId()
    if (!companyId) { setSignupError('Could not determine company. Try signing out and back in.'); setSigning(false); return }

    const { error } = await supabase.from('training_records').insert({
      company_id:     companyId,
      staff_id:       signupTarget.staff.id,
      course_id:      signupTarget.training.id,
      completed_date: signupTarget.training.date,
      confirmed:      false,
    })

    if (error) { setSignupError(error.message); setSigning(false); return }

    // Mark as just signed so the ✍️ disappears immediately
    setJustSigned(prev => new Set(prev).add(`${signupTarget.staff.id}:${signupTarget.training.id}`))
    setSigning(false)
    setSignupTarget(null)
  }

  const confirmTraining = signupTarget?.training
  const confirmStaff    = signupTarget?.staff
  const confirmStart    = fmtTime(confirmTraining?.start_time ?? null)
  const confirmEnd      = fmtTime(confirmTraining?.end_time   ?? null)
  const confirmTime     = confirmStart && confirmEnd ? `${confirmStart} – ${confirmEnd}` : confirmStart ?? null

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <BadgeCheck className="h-5 w-5 text-emerald-500" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <CalendarDays className="h-5 w-5 text-gray-800" />
          <span>Scheduled</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <UserPlus className="h-5 w-5 text-blue-500" />
          <span>Available — click to enrol</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-block w-5 h-5 rounded border border-dashed border-gray-300" />
          <span>Not assigned</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="border-collapse table-fixed w-full">
          <colgroup>
            {Array.from({ length: topics.length + 2 }).map((_, i) => (
              <col key={i} style={{ width: `${100 / (topics.length + 2)}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {/* Name header */}
              <th onClick={() => handleSort('name')} style={{ backgroundColor: '#457595' }}
                className="sticky left-0 top-0 z-30 cursor-pointer select-none px-5 py-3.5 text-center text-sm font-semibold text-white border-r border-white/20">
                <div className="flex items-center justify-center gap-1.5">
                  Staff Member <SortIcon id="name" sort={sort} />
                </div>
              </th>
              {/* Expiration Date header */}
              <th onClick={() => handleSort('cycle')} style={{ backgroundColor: '#457595' }}
                className="sticky top-0 z-20 cursor-pointer select-none px-5 py-3.5 text-center text-sm font-semibold text-white border-r border-white/20">
                <div className="flex items-center justify-center gap-1.5">
                  Expiration Date <SortIcon id="cycle" sort={sort} />
                </div>
              </th>
              {/* Topic headers */}
              {topics.map(topic => (
                <th key={topic.id} onClick={() => handleSort(topic.id)} style={{ backgroundColor: '#457595' }}
                  className="sticky top-0 z-20 cursor-pointer select-none px-5 py-3.5 text-center text-sm font-semibold text-white border-r border-white/20 last:border-r-0">
                  <div className="flex items-center justify-center gap-1.5">
                    {topic.name} <SortIcon id={topic.id} sort={sort} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sorted.map((s, rowIdx) => {
              const isEven = rowIdx % 2 === 0
              const rowBg  = isEven ? '#ffffff' : '#f9fafb'
              return (
                <tr key={s.id} className={isEven ? 'bg-white' : 'bg-gray-50/60'}>
                  {/* Name */}
                  <td className="sticky left-0 z-10 px-5 py-3 text-sm font-medium text-gray-800 text-center border-r border-gray-100"
                    style={{ backgroundColor: rowBg }}>
                    {displayName(s)}
                  </td>

                  {/* Expiration date */}
                  <td className="px-5 py-3 text-center border-r border-gray-100">
                    {s.cycle_end_date ? (() => {
                      const days = Math.ceil(
                        (new Date(s.cycle_end_date + 'T00:00:00').getTime() - Date.now()) / 86400000
                      )
                      const pill = days <= 30 ? 'bg-pink-100 text-pink-700'
                        : days <= 60          ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                      return (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pill}`}>
                          {fmtShortDate(s.cycle_end_date)}
                        </span>
                      )
                    })() : <span className="text-gray-300 text-sm">—</span>}
                  </td>

                  {/* Topic cells */}
                  {topics.map(topic => {
                    const cell         = matrix[s.id]?.[topic.id] ?? { status: 'none' as Status }
                    const hasTooltip   = cell.status !== 'none' && cell.training
                    const signupOption = cell.status === 'none' ? findSignupTraining(s, topic.id) : null

                    return (
                      <td key={topic.id} className="px-4 py-3 text-center border-r border-gray-100 last:border-r-0">
                        {cell.status !== 'none' ? (
                          // Existing status with optional tooltip
                          <div className="relative group inline-flex items-center justify-center w-full">
                            {cell.status === 'completed'
                              ? <BadgeCheck className="h-7 w-7 text-emerald-500" />
                              : <CalendarDays className="h-7 w-7 text-gray-800" />
                            }
                            {hasTooltip && (
                              <div className="hidden group-hover:block">
                                <TrainingTooltip detail={cell.training!} status={cell.status} />
                              </div>
                            )}
                          </div>
                        ) : signupOption ? (
                          // Available training — show enrol button
                          <div className="relative group inline-flex items-center justify-center w-full">
                            <button
                              onClick={() => { setSignupTarget({ staff: s, training: signupOption }); setSignupError(null) }}
                              className="hover:scale-125 transition-transform"
                              title={`Enrol ${displayName(s)} in ${signupOption.name}`}
                            >
                              <UserPlus className="h-7 w-7 text-blue-500" />
                            </button>
                            {/* Tooltip showing the available training details */}
                            <div className="hidden group-hover:block pointer-events-none">
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64">
                                <div className="bg-gray-900 text-white rounded-xl shadow-2xl overflow-hidden">
                                  <div className="h-1 w-full bg-blue-400" />
                                  <div className="p-3.5 space-y-2">
                                    <p className="text-xs text-blue-300 font-medium uppercase tracking-wide">Available training</p>
                                    <div className="flex items-start gap-2">
                                      <BookOpen className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                                      <span className="text-sm font-semibold leading-snug">{signupOption.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-300">
                                      <CalendarDays className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                      {fmtDate(signupOption.date)}
                                    </div>
                                    {(() => {
                                      const s = fmtTime(signupOption.start_time)
                                      const e = fmtTime(signupOption.end_time)
                                      const t = s && e ? `${s} – ${e}` : s
                                      return t ? (
                                        <div className="flex items-center gap-2 text-xs text-gray-300">
                                          <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                          {t}
                                        </div>
                                      ) : null
                                    })()}
                                    <div className="flex items-center gap-2 text-xs text-gray-300">
                                      <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                      {signupOption.trainer}
                                    </div>
                                    <p className="text-xs text-blue-300 pt-1">Click to enrol</p>
                                  </div>
                                </div>
                                <div className="flex justify-center">
                                  <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-gray-900" />
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={topics.length + 2} className="py-12 text-center text-sm text-gray-400">
                  No active staff found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Confirmation dialog ───────────────────────────────────────────── */}
      <Dialog open={!!signupTarget} onOpenChange={open => { if (!open) setSignupTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enrol in Training</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-700">
              Add <span className="font-semibold">{confirmStaff ? displayName(confirmStaff) : ''}</span> to this training?
            </p>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <BookOpen className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <span className="text-sm font-semibold text-gray-800">{confirmTraining?.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CalendarDays className="h-4 w-4 text-gray-400 shrink-0" />
                {fmtDate(confirmTraining?.date ?? null)}
              </div>
              {confirmTime && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  {confirmTime}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="h-4 w-4 text-gray-400 shrink-0" />
                {confirmTraining?.trainer}
              </div>
            </div>
            {signupError && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{signupError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignupTarget(null)} disabled={signing}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSignup} disabled={signing} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              {signing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : 'Yes, Enrol'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
