'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { getDisplayName } from '@/lib/display-name'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  BookPlus, Loader2, Search, ChevronRight, Clock, Paperclip,
  ChevronLeft, CheckCircle2, Circle, ExternalLink, CalendarDays, List, ClipboardList,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffOption = {
  id: string; first_name: string; last_name: string
  display_first_name: string | null; display_last_name: string | null
}

type TopicOption = { id: string; name: string }

type TrainingRecord = {
  id: string
  staff_id: string
  course_id: string
  completed_date: string
  expiry_date: string | null
  confirmed: boolean
  notes: string | null
  staff: { first_name: string; last_name: string; display_first_name: string | null; display_last_name: string | null } | null
  courses: { name: string } | null
}

type StaffRow = {
  id: string
  first_name: string; last_name: string
  display_first_name: string | null; display_last_name: string | null
}

type CourseRow = { id: string; name: string }

type Training = {
  id: string
  name: string
  description: string | null
  date: string | null
  start_time: string | null
  end_time: string | null
  units: number | null
  modality: string | null
  validity_months: number | null
  trainer_staff_id: string | null
  trainer_name: string | null
  trainer_cert_number: string | null
  topic_id: string | null
  staff: StaffOption | null
  training_document_links: { document_id: string }[]
  training_records: { staff_id: string; staff: { role: string | null } | null }[]
}

type CalAttendee = {
  id: string
  confirmed: boolean
  staff: StaffOption | null
}

type CalCourse = {
  id: string
  name: string
  date: string
  start_time: string | null
  end_time: string | null
  modality: string | null
  units: number | null
  records: CalAttendee[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODALITY_LABELS: Record<string, string> = {
  'in-person':            'In-person',
  'online-synchronous':   'Online synchronous',
  'online-asynchronous':  'Online asynchronous',
}

const MODALITY_STYLES: Record<string, string> = {
  'in-person':            'bg-emerald-100 text-emerald-700',
  'online-synchronous':   'bg-blue-100 text-blue-700',
  'online-asynchronous':  'bg-violet-100 text-violet-700',
}

// A palette of distinct pill colours for topics.
const TOPIC_PALETTE = [
  'bg-rose-100    text-rose-700',
  'bg-orange-100  text-orange-700',
  'bg-amber-100   text-amber-700',
  'bg-lime-100    text-lime-700',
  'bg-teal-100    text-teal-700',
  'bg-cyan-100    text-cyan-700',
  'bg-sky-100     text-sky-700',
  'bg-indigo-100  text-indigo-700',
  'bg-purple-100  text-purple-700',
  'bg-pink-100    text-pink-700',
]

function topicColorClass(topicId: string): string {
  let hash = 0
  for (let i = 0; i < topicId.length; i++) {
    hash = (hash * 31 + topicId.charCodeAt(i)) & 0xffff
  }
  return TOPIC_PALETTE[hash % TOPIC_PALETTE.length]
}

// ─── Calendar constants ───────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DOW = ['S','M','T','W','T','F','S']

const MODALITY_CELL: Record<string, string> = {
  'in-person':           'bg-emerald-100 hover:bg-emerald-200 text-emerald-900',
  'online-synchronous':  'bg-blue-100 hover:bg-blue-200 text-blue-900',
  'online-asynchronous': 'bg-violet-100 hover:bg-violet-200 text-violet-900',
}
const CELL_MULTI = 'bg-amber-100 hover:bg-amber-200 text-amber-900'
const CELL_OTHER = 'bg-gray-200 hover:bg-gray-300 text-gray-800'

const MODALITY_BADGE: Record<string, string> = {
  'in-person':           'bg-emerald-100 text-emerald-700',
  'online-synchronous':  'bg-blue-100 text-blue-700',
  'online-asynchronous': 'bg-violet-100 text-violet-700',
}

const MODALITY_LABEL: Record<string, string> = {
  'in-person':           'In-person',
  'online-synchronous':  'Online sync',
  'online-asynchronous': 'Online async',
}

const emptyForm = {
  name: '', description: '', date: '', start_time: '', end_time: '',
  units: '', validity_months: '', modality: '',
  trainer_staff_id: '', trainer_name: '', trainer_cert_number: '',
  topic_id: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(t: string | null) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDow(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function fmtSheetDate(year: number, month: number, day: number): string {
  return new Date(year, month, day).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function getCalDisplayName(s: StaffOption): string {
  return `${s.display_first_name || s.first_name} ${s.display_last_name || s.last_name}`
}

// ─── MonthGrid component ──────────────────────────────────────────────────────

function MonthGrid({
  year, month, coursesByDate, today, onDayClick,
}: {
  year: number
  month: number
  coursesByDate: Map<string, { modality: string | null }[]>
  today: string
  onDayClick: (dateKey: string) => void
}) {
  const days     = getDaysInMonth(year, month)
  const firstDow = getFirstDow(year, month)
  const trainingCount = Array.from({ length: days }, (_, i) => {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    return coursesByDate.has(key)
  }).filter(Boolean).length

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ]
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

export default function TrainingsPage() {
  const supabase     = createClient()
  const router       = useRouter()
  const searchParams = useSearchParams()

  // List view state
  const [trainings, setTrainings]     = useState<Training[]>([])
  const [staffList, setStaffList]     = useState<StaffOption[]>([])
  const [topicList, setTopicList]     = useState<TopicOption[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [dialogOpen, setDialogOpen]   = useState(false)
  const [editing, setEditing]         = useState<Training | null>(null)
  const [form, setForm]               = useState(emptyForm)
  const [trainerType, setTrainerType] = useState<'staff' | 'external'>('staff')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [loadError, setLoadError]     = useState<string | null>(null)

  // Training records tab state
  const [trRecords, setTrRecords]               = useState<TrainingRecord[]>([])
  const [trStaff, setTrStaff]                   = useState<StaffRow[]>([])
  const [trCourses, setTrCourses]               = useState<CourseRow[]>([])
  const [trLoading, setTrLoading]               = useState(false)
  const [trLoaded, setTrLoaded]                 = useState(false)
  const [trSearch, setTrSearch]                 = useState('')
  const [trFilterStaff, setTrFilterStaff]       = useState('all')
  const [trFilterCourse, setTrFilterCourse]     = useState('all')
  const [trFilterAttendance, setTrFilterAttendance] = useState('all')

  async function loadTrainingRecords() {
    if (trLoaded) return
    setTrLoading(true)
    const supabase = createClient()
    const [recordsRes, staffRes, coursesRes] = await Promise.all([
      supabase
        .from('training_records')
        .select('id, staff_id, course_id, completed_date, expiry_date, confirmed, notes, staff(first_name, last_name, display_first_name, display_last_name), courses(name)')
        .order('completed_date', { ascending: false }),
      supabase.from('staff').select('id, first_name, last_name, display_first_name, display_last_name').eq('active', true).order('last_name'),
      supabase.from('courses').select('id, name').order('name'),
    ])
    setTrRecords((recordsRes.data ?? []) as unknown as TrainingRecord[])
    setTrStaff(staffRes.data ?? [])
    setTrCourses(coursesRes.data ?? [])
    setTrLoaded(true)
    setTrLoading(false)
  }

  // Tab + calendar state
  const initialTab = searchParams.get('tab') === 'records' ? 'records' : 'list'
  const [activeTab, setActiveTab]             = useState<'list' | 'calendar' | 'records'>(initialTab as 'list' | 'calendar' | 'records')
  const [calYear, setCalYear]                 = useState(new Date().getFullYear())
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null)
  const [calDayCourses, setCalDayCourses]     = useState<CalCourse[]>([])
  const [calLoadingDay, setCalLoadingDay]     = useState(false)

  const today = new Date().toISOString().split('T')[0]

  // ── Data loading ────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const [trainingsRes, staffRes, topicsRes] = await Promise.all([
        supabase
          .from('courses')
          .select(`
            id, name, description, date, start_time, end_time, units, modality,
            validity_months, trainer_staff_id, trainer_name, trainer_cert_number,
            topic_id,
            staff:trainer_staff_id(id, first_name, last_name, display_first_name, display_last_name),
            training_document_links(document_id),
            training_records(staff_id, staff:staff_id(role))
          `)
          .order('date', { ascending: false }),
        supabase
          .from('staff')
          .select('id, first_name, last_name, display_first_name, display_last_name, role')
          .eq('active', true)
          .or('role.neq.RBT,role.is.null')
          .order('last_name'),
        supabase
          .from('topics')
          .select('id, name')
          .order('name'),
      ])
      if (trainingsRes.error) throw new Error(trainingsRes.error.message)
      if (staffRes.error)     throw new Error(staffRes.error.message)
      setTrainings((trainingsRes.data ?? []) as unknown as Training[])
      setStaffList(staffRes.data ?? [])
      setTopicList(topicsRes.data ?? [])
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load trainings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (searchParams.get('tab') === 'records') loadTrainingRecords()
  }, [])

  // ── Dialog helpers ──────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setTrainerType('staff')
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(t: Training, e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(t)
    setForm({
      name:               t.name,
      description:        t.description ?? '',
      date:               t.date ?? '',
      start_time:         t.start_time?.slice(0, 5) ?? '',
      end_time:           t.end_time?.slice(0, 5) ?? '',
      units:              t.units?.toString() ?? '',
      validity_months:    t.validity_months?.toString() ?? '',
      modality:           t.modality ?? '',
      trainer_staff_id:   t.trainer_staff_id ?? '',
      trainer_name:       t.trainer_name ?? '',
      trainer_cert_number: t.trainer_cert_number ?? '',
      topic_id:           t.topic_id ?? '',
    })
    setTrainerType(t.trainer_staff_id ? 'staff' : 'external')
    setError(null)
    setDialogOpen(true)
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim())      { setError('Training name is required.'); return }
    if (!form.date)             { setError('Date is required.'); return }
    if (!form.start_time)       { setError('Start time is required.'); return }
    if (!form.end_time)         { setError('End time is required.'); return }
    if (!form.units)            { setError('PDUs are required.'); return }
    if (!form.modality)         { setError('Modality is required.'); return }

    const payload = {
      name:                form.name.trim(),
      description:         form.description || null,
      date:                form.date,
      start_time:          form.start_time,
      end_time:            form.end_time,
      units:               parseFloat(form.units),
      validity_months:     form.validity_months ? parseInt(form.validity_months) : null,
      modality:            form.modality,
      trainer_staff_id:    trainerType === 'staff'     ? form.trainer_staff_id || null : null,
      trainer_name:        trainerType === 'external'  ? form.trainer_name || null     : null,
      trainer_cert_number: trainerType === 'external'  ? form.trainer_cert_number || null : null,
      topic_id:            form.topic_id || null,
    }

    setSaving(true)
    setError(null)

    if (editing) {
      const { error: err } = await supabase.from('courses').update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const companyId = await getCompanyId()
      if (!companyId) { setError('Could not determine your company. Please sign out and back in.'); setSaving(false); return }
      const { error: err } = await supabase.from('courses').insert({ ...payload, company_id: companyId })
      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false)
    setDialogOpen(false)
    load()
  }

  // ── List filter ─────────────────────────────────────────────────────────────

  const filtered = trainings.filter(t => {
    const trainerDisplay = t.staff ? getDisplayName(t.staff) : (t.trainer_name ?? '')
    return `${t.name} ${trainerDisplay} ${t.modality ?? ''}`
      .toLowerCase().includes(search.toLowerCase())
  })

  // ── Calendar helpers ─────────────────────────────────────────────────────────

  // Group trainings for the selected calYear
  const calCoursesByDate = new Map<string, Training[]>()
  for (const t of trainings) {
    if (!t.date || !t.date.startsWith(String(calYear))) continue
    if (!calCoursesByDate.has(t.date)) calCoursesByDate.set(t.date, [])
    calCoursesByDate.get(t.date)!.push(t)
  }

  async function handleCalDayClick(dateKey: string) {
    setCalSelectedDate(dateKey)
    setCalDayCourses([])
    setCalLoadingDay(true)

    const coursesOnDay = calCoursesByDate.get(dateKey) ?? []
    const ids = coursesOnDay.map(c => c.id)

    if (ids.length === 0) { setCalLoadingDay(false); return }

    const { data } = await supabase
      .from('training_records')
      .select('id, confirmed, course_id, staff:staff_id(id, first_name, last_name, display_first_name, display_last_name)')
      .in('course_id', ids)

    const recordsByCourse = new Map<string, CalAttendee[]>()
    for (const r of (data ?? []) as unknown as { id: string; confirmed: boolean; course_id: string; staff: StaffOption | StaffOption[] | null }[]) {
      const cid = r.course_id
      if (!recordsByCourse.has(cid)) recordsByCourse.set(cid, [])
      const staffVal = Array.isArray(r.staff) ? (r.staff[0] ?? null) : r.staff
      recordsByCourse.get(cid)!.push({ id: r.id, confirmed: r.confirmed, staff: staffVal })
    }

    const result: CalCourse[] = coursesOnDay.map(c => ({
      id:         c.id,
      name:       c.name,
      date:       c.date ?? '',
      start_time: c.start_time,
      end_time:   c.end_time,
      modality:   c.modality,
      units:      c.units,
      records:    recordsByCourse.get(c.id) ?? [],
    }))

    setCalDayCourses(result)
    setCalLoadingDay(false)
  }

  const calSelectedParts = calSelectedDate
    ? {
        year:  parseInt(calSelectedDate.slice(0, 4)),
        month: parseInt(calSelectedDate.slice(5, 7)) - 1,
        day:   parseInt(calSelectedDate.slice(8, 10)),
      }
    : null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Trainings</h1>
          <p className="mt-1 text-sm text-gray-500">{trainings.length} total trainings</p>
        </div>
        <Button onClick={openAdd} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
          <BookPlus className="mr-2 h-4 w-4" /> Add Training
        </Button>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'list'
              ? 'border-[#457595] text-[#457595]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <List className="h-4 w-4" />
          List View
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'calendar'
              ? 'border-[#457595] text-[#457595]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Calendar View
        </button>
        <button
          onClick={() => { setActiveTab('records'); loadTrainingRecords() }}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'records'
              ? 'border-[#457595] text-[#457595]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Training Records
        </button>
      </div>

      {/* ── List View ──────────────────────────────────────────────────────── */}
      {activeTab === 'list' && (
        <>
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search by name, trainer, or modality…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Training Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>PDUs</TableHead>
                  <TableHead>Modality</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Trainer</TableHead>
                  <TableHead>RBTs</TableHead>
                  <TableHead>Docs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-gray-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell></TableRow>
                ) : loadError ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-10">
                    <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 inline-block">{loadError}</p>
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-gray-400">
                    {search ? 'No trainings match your search.' : 'No trainings yet. Add your first one.'}
                  </TableCell></TableRow>
                ) : filtered.map(t => {
                  const trainerDisplay = t.staff
                    ? getDisplayName(t.staff)
                    : t.trainer_name
                      ? `${t.trainer_name} (Ext.)`
                      : '—'
                  const rbtCount = (t.training_records ?? []).filter(r => r.staff?.role === 'RBT').length
                  const docCount = t.training_document_links?.length ?? 0

                  return (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-gray-50"
                      onClick={() => router.push(`/trainings/${t.id}`)}>
                      <TableCell className="font-medium text-blue-600">{t.name}</TableCell>
                      <TableCell className="text-gray-600 whitespace-nowrap">{fmtDate(t.date)}</TableCell>
                      <TableCell className="text-gray-500 whitespace-nowrap text-sm">
                        {t.start_time && t.end_time
                          ? <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtTime(t.start_time)}–{fmtTime(t.end_time)}</span>
                          : '—'}
                      </TableCell>
                      <TableCell className="text-gray-600">{t.units != null ? `${t.units} PDU${t.units !== 1 ? 's' : ''}` : '—'}</TableCell>
                      <TableCell>
                        {t.modality ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${MODALITY_STYLES[t.modality] ?? 'bg-gray-100 text-gray-600'}`}>
                            {MODALITY_LABELS[t.modality] ?? t.modality}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const topic = t.topic_id ? topicList.find(tp => tp.id === t.topic_id) : null
                          return topic ? (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${topicColorClass(topic.id)}`}>
                              {topic.name}
                            </span>
                          ) : <span className="text-gray-300 text-sm">—</span>
                        })()}
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">{trainerDisplay}</TableCell>
                      <TableCell className="text-gray-600 tabular-nums text-sm">
                        {rbtCount > 0 ? rbtCount : <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell>
                        {docCount > 0 ? (
                          <span className="flex items-center gap-1 text-sm text-gray-500">
                            <Paperclip className="h-3.5 w-3.5" />{docCount}
                          </span>
                        ) : <span className="text-gray-300 text-sm">—</span>}
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={e => openEdit(t, e)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => router.push(`/trainings/${t.id}`)}>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── Calendar View ──────────────────────────────────────────────────── */}
      {activeTab === 'calendar' && (
        <>
          {/* Year nav + legend */}
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCalYear(y => y - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-lg font-bold text-gray-800 w-14 text-center">{calYear}</span>
              <Button variant="outline" size="sm" onClick={() => setCalYear(y => y + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-5 flex-wrap">
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
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 12 }, (_, i) => (
                <MonthGrid
                  key={i}
                  year={calYear}
                  month={i}
                  coursesByDate={calCoursesByDate}
                  today={today}
                  onDayClick={handleCalDayClick}
                />
              ))}
            </div>
          )}

          {/* Day detail sheet */}
          <Sheet open={!!calSelectedDate} onOpenChange={open => { if (!open) setCalSelectedDate(null) }}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>
                  {calSelectedParts
                    ? fmtSheetDate(calSelectedParts.year, calSelectedParts.month, calSelectedParts.day)
                    : ''}
                </SheetTitle>
              </SheetHeader>

              <div className="px-6 py-5 space-y-6">
                {calLoadingDay ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : calDayCourses.map(c => {
                  const isFuture    = c.date > today
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
                            {confirmed.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                                  {isFuture ? 'Registered' : 'Attended'} · {confirmed.length}
                                </p>
                                <ul className="space-y-1">
                                  {confirmed.map(r => (
                                    <li key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                      {r.staff ? getCalDisplayName(r.staff) : <span className="text-gray-400 italic">Unknown</span>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {unconfirmed.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                                  {isFuture ? 'Invited' : 'Unconfirmed'} · {unconfirmed.length}
                                </p>
                                <ul className="space-y-1">
                                  {unconfirmed.map(r => (
                                    <li key={r.id} className="flex items-center gap-2 text-sm text-gray-500">
                                      <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                                      {r.staff ? getCalDisplayName(r.staff) : <span className="italic">Unknown</span>}
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
        </>
      )}

      {/* ── Training Records Tab ─────────────────────────────────────────── */}
      {activeTab === 'records' && (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Search by name or training…" value={trSearch}
                onChange={e => setTrSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={trFilterStaff} onValueChange={v => setTrFilterStaff(v ?? 'all')}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All Staff" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {trStaff.map(s => (
                  <SelectItem key={s.id} value={s.id}>{getDisplayName(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={trFilterCourse} onValueChange={v => setTrFilterCourse(v ?? 'all')}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All Trainings" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trainings</SelectItem>
                {trCourses.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={trFilterAttendance} onValueChange={v => setTrFilterAttendance(v ?? 'all')}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All Attendance" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Attendance</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!trLoading && trLoaded && (
            <p className="mb-3 text-sm text-gray-500">
              {trRecords.length} total · {trRecords.filter(r => r.confirmed).length} confirmed
            </p>
          )}

          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Training</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Attendance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-gray-400">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : (() => {
                  const filtered = trRecords.filter(r => {
                    const name = r.staff ? getDisplayName({ first_name: r.staff.first_name, last_name: r.staff.last_name, display_first_name: r.staff.display_first_name ?? null, display_last_name: r.staff.display_last_name ?? null }) : ''
                    return (
                      `${name} ${r.courses?.name ?? ''}`.toLowerCase().includes(trSearch.toLowerCase()) &&
                      (trFilterStaff === 'all' || r.staff_id === trFilterStaff) &&
                      (trFilterCourse === 'all' || r.course_id === trFilterCourse) &&
                      (trFilterAttendance === 'all' || (trFilterAttendance === 'confirmed' && r.confirmed) || (trFilterAttendance === 'pending' && !r.confirmed))
                    )
                  })
                  return filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-10 text-gray-400">
                        {trSearch || trFilterStaff !== 'all' || trFilterCourse !== 'all' || trFilterAttendance !== 'all'
                          ? 'No records match your filters.'
                          : 'No training records yet.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {filtered.map(r => {
                        const staffName = r.staff ? getDisplayName({ first_name: r.staff.first_name, last_name: r.staff.last_name, display_first_name: r.staff.display_first_name ?? null, display_last_name: r.staff.display_last_name ?? null }) : '—'
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{staffName}</TableCell>
                            <TableCell className="text-gray-700">{r.courses?.name ?? '—'}</TableCell>
                            <TableCell className="text-gray-600 whitespace-nowrap">
                              {new Date(r.completed_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${r.confirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {r.confirmed ? <><CheckCircle2 className="h-3 w-3" /> Confirmed</> : <><Circle className="h-3 w-3" /> Pending</>}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </>
                  )
                })()}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── Add / Edit Sheet ──────────────────────────────────────────────── */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit Training' : 'Add Training'}</SheetTitle>
          </SheetHeader>

          <div className="space-y-5 px-6 py-5">
            {/* Name + Description */}
            <div className="space-y-2">
              <Label>Training Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} placeholder="Optional description…"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            {/* Date + Modality */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Modality *</Label>
                <Select value={form.modality} onValueChange={v => setForm(f => ({ ...f, modality: v ?? '' }))}>
                  <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in-person">In-person</SelectItem>
                    <SelectItem value="online-synchronous">Online synchronous</SelectItem>
                    <SelectItem value="online-asynchronous">Online asynchronous</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time *</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Time *</Label>
                <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>

            {/* PDUs */}
            <div className="space-y-2">
              <Label>PDUs *</Label>
              <Input type="number" min="0" step="0.25" placeholder="e.g. 1.5"
                value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
            </div>

            {/* Trainer */}
            <div className="space-y-3">
              <Label>Trainer</Label>
              <div className="flex rounded-md border overflow-hidden w-fit">
                {(['staff', 'external'] as const).map(type => (
                  <button key={type} type="button"
                    onClick={() => setTrainerType(type)}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                      trainerType === type
                        ? 'bg-[#0A253D] text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}>
                    {type === 'staff' ? 'Staff Member' : 'External'}
                  </button>
                ))}
              </div>

              {trainerType === 'staff' ? (
                <Select value={form.trainer_staff_id}
                  onValueChange={v => setForm(f => ({ ...f, trainer_staff_id: v ?? '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map(s => (
                      <SelectItem key={s.id} value={s.id}>{getDisplayName(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Trainer Name</Label>
                    <Input placeholder="e.g. Dr. Jane Doe"
                      value={form.trainer_name}
                      onChange={e => setForm(f => ({ ...f, trainer_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cert Number</Label>
                    <Input placeholder="e.g. BCBA-12345"
                      value={form.trainer_cert_number}
                      onChange={e => setForm(f => ({ ...f, trainer_cert_number: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>

            {/* Topic */}
            {topicList.length > 0 && (
              <div className="space-y-2">
                <Label>Topic</Label>
                <Select
                  value={form.topic_id}
                  onValueChange={v => setForm(f => ({ ...f, topic_id: (!v || v === '__none__') ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select a topic (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {topicList.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Training'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
