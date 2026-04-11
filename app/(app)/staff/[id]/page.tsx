'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { getCompanyId } from '@/lib/get-company-id'
import { getDisplayName, getLegalName, hasPreferredName } from '@/lib/display-name'
import { getCycleStatus, isActiveCycle, cycleStatusStyles } from '@/lib/cycle-status'
import {
  ArrowLeft,
  Pencil,
  Plus,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffMember = {
  id: string
  first_name: string
  last_name: string
  display_first_name: string | null
  display_last_name: string | null
  email: string | null
  role: string | null
  ehr_id: string | null
  active: boolean
  certification_number: string | null
  original_certification_date: string | null
  credentials: string | null
}

type Cycle = {
  id: string
  certification_type: string
  start_date: string
  end_date: string
  notes: string | null
}

type TrainingRecord = {
  id: string
  completed_date: string
  expiry_date: string | null
  notes: string | null
  courses: { name: string } | null
}

type AllTrainingRecord = {
  id: string
  completed_date: string
  expiry_date: string | null
  confirmed: boolean
  notes: string | null
  courses: {
    id: string
    name: string
    units: number
    trainer_name: string | null
    trainer_staff_id: string | null
    staff: { first_name: string; last_name: string; display_first_name: string | null; display_last_name: string | null } | null
  } | null
}

type UpcomingTraining = {
  id: string
  name: string
  date: string | null
  start_time: string | null
  units: number | null
  modality: string | null
  staff: { first_name: string; last_name: string; display_first_name: string | null; display_last_name: string | null } | null
  trainer_name: string | null
}

type OverlapWarning = {
  conflictingCycle: Cycle
  suggestedEndDate: string
}

const emptyCycleForm = {
  start_date: '',
  end_date: '',
  notes: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function dayBefore(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function detectOverlap(cycles: Cycle[], startDate: string, endDate: string, excludeId?: string): OverlapWarning | null {
  for (const cycle of cycles) {
    if (cycle.id === excludeId) continue
    // Overlap: new range intersects existing range
    if (startDate <= cycle.end_date && endDate >= cycle.start_date) {
      return {
        conflictingCycle: cycle,
        suggestedEndDate: dayBefore(startDate),
      }
    }
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StaffDetailPage() {
  const params = useParams()
  const staffId = params.id as string
  const router = useRouter()
  const supabase = createClient()

  // Data
  const [staff, setStaff] = useState<StaffMember | null>(null)
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [allRecords, setAllRecords] = useState<AllTrainingRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Training records per cycle (loaded on expand)
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null)
  const [cycleRecords, setCycleRecords] = useState<Record<string, TrainingRecord[]>>({})
  const [loadingRecords, setLoadingRecords] = useState(false)

  // Edit staff dialog
  const [editStaffOpen, setEditStaffOpen] = useState(false)
  const [staffForm, setStaffForm] = useState({ first_name: '', last_name: '', display_first_name: '', display_last_name: '', email: '', role: '', ehr_id: '', certification_number: '', original_certification_date: '', credentials: '' })
  const [savingStaff, setSavingStaff] = useState(false)
  const [staffError, setStaffError] = useState<string | null>(null)

  // Add to training sheet
  const [addToTrainingOpen, setAddToTrainingOpen]       = useState(false)
  const [upcomingTrainings, setUpcomingTrainings]        = useState<UpcomingTraining[]>([])
  const [loadingUpcoming, setLoadingUpcoming]            = useState(false)
  const [addingToTrainingId, setAddingToTrainingId]      = useState<string | null>(null)
  const [addedToTrainingIds, setAddedToTrainingIds]      = useState<Set<string>>(new Set())

  async function openAddToTraining() {
    setAddToTrainingOpen(true)
    if (upcomingTrainings.length > 0) return
    setLoadingUpcoming(true)
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('courses')
      .select('id, name, date, start_time, units, modality, trainer_name, trainer_staff_id, staff:trainer_staff_id(first_name, last_name, display_first_name, display_last_name)')
      .gte('date', today)
      .order('date', { ascending: true })
    setUpcomingTrainings((data ?? []) as unknown as UpcomingTraining[])
    // Pre-mark any trainings this person is already in
    const existing = new Set(allRecords.map(r => r.courses?.id).filter(Boolean) as string[])
    setAddedToTrainingIds(existing)
    setLoadingUpcoming(false)
  }

  async function handleAddToTraining(training: UpcomingTraining) {
    setAddingToTrainingId(training.id)
    const companyId = await getCompanyId()
    if (!companyId) { setAddingToTrainingId(null); return }
    const completedDate = training.date ?? new Date().toISOString().split('T')[0]
    const expiryDate = null // can be set later
    const { error } = await supabase.from('training_records').insert({
      company_id: companyId,
      staff_id:   staffId,
      course_id:  training.id,
      completed_date: completedDate,
      expiry_date:    expiryDate,
      confirmed:      false,
    })
    if (!error) {
      setAddedToTrainingIds(prev => new Set(Array.from(prev).concat(training.id)))
      loadAllRecords()
    }
    setAddingToTrainingId(null)
  }

  // Cycle dialog
  const [cycleDialogOpen, setCycleDialogOpen] = useState(false)
  const [editingCycle, setEditingCycle] = useState<Cycle | null>(null)
  const [cycleForm, setCycleForm] = useState(emptyCycleForm)
  const [savingCycle, setSavingCycle] = useState(false)
  const [cycleError, setCycleError] = useState<string | null>(null)
  const [overlapWarning, setOverlapWarning] = useState<OverlapWarning | null>(null)

  // ─── Data loading ───────────────────────────────────────────────────────────

  const loadStaff = useCallback(async () => {
    const { data } = await supabase.from('staff').select('*').eq('id', staffId).single()
    if (data) setStaff(data)
  }, [staffId])

  const loadCycles = useCallback(async () => {
    const { data } = await supabase
      .from('certification_cycles')
      .select('*')
      .eq('staff_id', staffId)
      .order('start_date', { ascending: false })
    setCycles(data ?? [])
  }, [staffId])

  const loadAllRecords = useCallback(async () => {
    const { data } = await supabase
      .from('training_records')
      .select('id, completed_date, expiry_date, confirmed, notes, courses(id, name, units, trainer_name, trainer_staff_id, staff:trainer_staff_id(first_name, last_name, display_first_name, display_last_name))')
      .eq('staff_id', staffId)
      .order('completed_date', { ascending: false })
    setAllRecords((data ?? []) as unknown as AllTrainingRecord[])
  }, [staffId])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await Promise.all([loadStaff(), loadCycles(), loadAllRecords()])
      setLoading(false)
    }
    init()
  }, [loadStaff, loadCycles, loadAllRecords])

  async function loadCycleRecords(cycle: Cycle) {
    if (cycleRecords[cycle.id]) return // already loaded
    setLoadingRecords(true)
    const { data } = await supabase
      .from('training_records')
      .select('id, completed_date, expiry_date, notes, courses(name)')
      .eq('staff_id', staffId)
      .gte('completed_date', cycle.start_date)
      .lte('completed_date', cycle.end_date)
      .order('completed_date', { ascending: false })
    setCycleRecords(prev => ({ ...prev, [cycle.id]: (data ?? []) as unknown as TrainingRecord[] }))
    setLoadingRecords(false)
  }

  function toggleCycle(cycle: Cycle) {
    if (expandedCycleId === cycle.id) {
      setExpandedCycleId(null)
    } else {
      setExpandedCycleId(cycle.id)
      loadCycleRecords(cycle)
    }
  }

  // ─── Staff editing ──────────────────────────────────────────────────────────

  function openEditStaff() {
    if (!staff) return
    setStaffForm({
      first_name: staff.first_name,
      last_name: staff.last_name,
      display_first_name: staff.display_first_name ?? '',
      display_last_name: staff.display_last_name ?? '',
      email: staff.email ?? '',
      role: staff.role ?? '',
      ehr_id: staff.ehr_id ?? '',
      certification_number: staff.certification_number ?? '',
      original_certification_date: staff.original_certification_date ?? '',
      credentials: staff.credentials ?? '',
    })
    setStaffError(null)
    setEditStaffOpen(true)
  }

  async function handleSaveStaff() {
    if (!staffForm.first_name.trim() || !staffForm.last_name.trim()) {
      setStaffError('First name and last name are required.')
      return
    }
    setSavingStaff(true)
    const { error } = await supabase.from('staff').update({
      first_name: staffForm.first_name,
      last_name: staffForm.last_name,
      display_first_name: staffForm.display_first_name.trim() || null,
      display_last_name: staffForm.display_last_name.trim() || null,
      email: staffForm.email || null,
      role: staffForm.role || null,
      ehr_id: staffForm.ehr_id || null,
      certification_number: staffForm.certification_number.trim() || null,
      original_certification_date: staffForm.original_certification_date || null,
      credentials: staffForm.credentials.trim() || null,
    }).eq('id', staffId)
    if (error) { setStaffError(error.message); setSavingStaff(false); return }
    setSavingStaff(false)
    setEditStaffOpen(false)
    loadStaff()
  }

  // ─── Cycle management ───────────────────────────────────────────────────────

  function openAddCycle() {
    setEditingCycle(null)
    setCycleError(null)
    setOverlapWarning(null)

    setCycleForm(emptyCycleForm)

    setCycleDialogOpen(true)
  }

  function openEditCycle(cycle: Cycle) {
    setEditingCycle(cycle)
    setCycleForm({
      start_date: cycle.start_date,
      end_date: cycle.end_date,
      notes: cycle.notes ?? '',
    })
    setCycleError(null)
    setOverlapWarning(null)
    setCycleDialogOpen(true)
  }

  async function handleSaveCycle(autoFixOverlap = false) {
    if (!cycleForm.start_date || !cycleForm.end_date) {
      setCycleError('Start date and end date are required.')
      return
    }
    if (cycleForm.start_date >= cycleForm.end_date) {
      setCycleError('End date must be after start date.')
      return
    }

    // Check for overlaps
    const overlap = detectOverlap(cycles, cycleForm.start_date, cycleForm.end_date, editingCycle?.id)
    if (overlap && !autoFixOverlap) {
      setOverlapWarning(overlap)
      return
    }

    setSavingCycle(true)
    setCycleError(null)

    try {
      // If auto-fixing, update the conflicting cycle's end date first
      if (autoFixOverlap && overlapWarning) {
        const { error: fixError } = await supabase
          .from('certification_cycles')
          .update({ end_date: overlapWarning.suggestedEndDate })
          .eq('id', overlapWarning.conflictingCycle.id)
        if (fixError) throw fixError
        // Invalidate cached records for that cycle since date range changed
        setCycleRecords(prev => {
          const next = { ...prev }
          delete next[overlapWarning.conflictingCycle.id]
          return next
        })
      }

      if (editingCycle) {
        const { error } = await supabase.from('certification_cycles').update({
          certification_type: 'RBT',
          start_date: cycleForm.start_date,
          end_date: cycleForm.end_date,
          notes: cycleForm.notes || null,
        }).eq('id', editingCycle.id)
        if (error) throw error
        // Invalidate cached records — date range may have changed
        setCycleRecords(prev => {
          const next = { ...prev }
          delete next[editingCycle.id]
          return next
        })
      } else {
        const companyId = await getCompanyId()
        if (!companyId) throw new Error('Could not determine your company. Please sign out and sign back in.')
        const { error } = await supabase.from('certification_cycles').insert({
          company_id: companyId,
          staff_id: staffId,
          certification_type: 'RBT',
          start_date: cycleForm.start_date,
          end_date: cycleForm.end_date,
          notes: cycleForm.notes || null,
        })
        if (error) throw error
      }

      setOverlapWarning(null)
      setCycleDialogOpen(false)
      loadCycles()
    } catch (err: unknown) {
      setCycleError(err instanceof Error ? err.message : 'An error occurred.')
    } finally {
      setSavingCycle(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!staff) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Staff member not found.</p>
        <Button variant="link" onClick={() => router.push('/staff')}>← Back to Staff</Button>
      </div>
    )
  }

  // activeCycle retained for future use (e.g. status badge)
  void cycles.find(c => isActiveCycle(c.start_date, c.end_date))

  const basicsRows: { label: string; value: React.ReactNode; mono?: boolean }[] = [
    { label: 'Legal First Name',    value: staff.first_name },
    { label: 'Legal Last Name',     value: staff.last_name },
    { label: 'Preferred First',     value: staff.display_first_name ?? <span className="text-gray-400 italic">same as legal</span> },
    { label: 'Preferred Last',      value: staff.display_last_name  ?? <span className="text-gray-400 italic">same as legal</span> },
    { label: 'Email',               value: staff.email ?? '—' },
    { label: 'Role',                value: staff.role ?? '—' },
    { label: 'Credentials',         value: staff.credentials ?? <span className="text-gray-400 italic">—</span> },
    { label: 'BACB Cert #',         value: staff.certification_number ?? '—', mono: true },
    { label: 'Original Cert Date',  value: staff.original_certification_date ? formatDate(staff.original_certification_date) : '—' },
  ]

  return (
    <div className="p-8 max-w-[1400px]">

      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.push('/staff')}
          className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Staff
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {getDisplayName(staff)}
            </h1>
            {hasPreferredName(staff) && (
              <p className="text-sm text-gray-400">Legal name: {getLegalName(staff)}</p>
            )}
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={staff.active ? 'default' : 'secondary'}>
                {staff.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={openEditStaff}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Info
          </Button>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Column 1: Basics ─────────────────────────────────────────────── */}
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Basics</h2>
            <p className="text-sm text-gray-500">Staff details</p>
          </div>
          <div className="rounded-lg border bg-white shadow-sm divide-y divide-gray-100">
            {basicsRows.map(row => (
              <div key={row.label} className="px-4 py-3">
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{row.label}</dt>
                <dd className={`mt-1 text-sm text-gray-900 break-words ${row.mono ? 'font-mono' : ''}`}>
                  {row.value}
                </dd>
              </div>
            ))}
          </div>
        </section>

        {/* ── Column 2: Certification Cycles ───────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Certification Cycles</h2>
              <p className="text-sm text-gray-500">{cycles.length} cycle{cycles.length !== 1 ? 's' : ''} on record</p>
            </div>
            <Button onClick={openAddCycle} size="sm" className="bg-[#0A253D] hover:bg-[#0d2f4f] shrink-0">
              <Plus className="mr-1.5 h-4 w-4" /> Add
            </Button>
          </div>

          {cycles.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
              No certification cycles yet.
            </div>
          ) : (
            <div className="space-y-3">
              {cycles.map(cycle => {
                const isExpanded = expandedCycleId === cycle.id
                const records = cycleRecords[cycle.id]
                const status = getCycleStatus(cycle.start_date, cycle.end_date)

                return (
                  <div key={cycle.id} className="rounded-lg border bg-white shadow-sm overflow-hidden">
                    {/* Cycle header row */}
                    <div
                      className="flex items-center gap-2 px-3 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleCycle(cycle)}
                    >
                      <button className="text-gray-400 shrink-0">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />}
                      </button>

                      <span className="text-sm text-gray-700 font-medium">
                        {formatDate(cycle.start_date)} — {formatDate(cycle.end_date)}
                      </span>

                      <span className={`ml-auto shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cycleStatusStyles[status]}`}>
                        {status}
                      </span>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 h-7 w-7 p-0"
                        onClick={e => { e.stopPropagation(); openEditCycle(cycle) }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Expanded: training records */}
                    {isExpanded && (
                      <div className="border-t bg-gray-50 px-3 py-3">
                        {cycle.notes && (
                          <p className="mb-3 text-xs text-gray-500 italic">{cycle.notes}</p>
                        )}

                        {loadingRecords && !records ? (
                          <div className="flex items-center gap-2 py-3 text-sm text-gray-400">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                          </div>
                        ) : !records || records.length === 0 ? (
                          <p className="py-3 text-xs text-gray-400 text-center">
                            No training records in this cycle&apos;s dates.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {records.map(r => (
                              <li key={r.id} className="rounded-md bg-white border border-gray-100 px-3 py-2">
                                <p className="text-sm font-medium text-gray-900">{r.courses?.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Completed {formatDate(r.completed_date)}
                                  {r.expiry_date && <> · Expires {formatDate(r.expiry_date)}</>}
                                </p>
                                {r.notes && <p className="text-xs text-gray-500 mt-1 italic">{r.notes}</p>}
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-gray-500 h-7"
                            onClick={e => {
                              e.stopPropagation()
                              setCycleRecords(prev => { const n = { ...prev }; delete n[cycle.id]; return n })
                              loadCycleRecords(cycle)
                            }}
                          >
                            <RefreshCw className="mr-1 h-3 w-3" /> Refresh
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Column 3: All Trainings ──────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">All Trainings</h2>
              <p className="text-sm text-gray-500">
                {allRecords.length} record{allRecords.length !== 1 ? 's' : ''} on file
              </p>
            </div>
            <Button onClick={openAddToTraining} size="sm" className="bg-[#0A253D] hover:bg-[#0d2f4f] shrink-0">
              <Plus className="mr-1.5 h-4 w-4" /> Add
            </Button>
          </div>

          {allRecords.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
              No training records yet.
            </div>
          ) : (
            <div className="space-y-3">
              {allRecords.map(r => {
                const trainerName = r.courses?.staff
                  ? getDisplayName(r.courses.staff)
                  : r.courses?.trainer_name ?? null
                return (
                  <div key={r.id} className="rounded-lg border bg-white shadow-sm p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">{r.courses?.name ?? '—'}</p>
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.confirmed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {r.confirmed ? 'Confirmed' : 'Pending'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Completed {formatDate(r.completed_date)}
                      {r.courses?.units != null && <> · {r.courses.units} unit{r.courses.units === 1 ? '' : 's'}</>}
                      {r.expiry_date && <> · Expires {formatDate(r.expiry_date)}</>}
                    </p>
                    {trainerName && (
                      <p className="mt-1 text-xs text-gray-500">Trainer: {trainerName}</p>
                    )}
                    {r.notes && <p className="mt-1 text-xs text-gray-500 italic">{r.notes}</p>}
                    {r.courses?.id && (
                      <Link
                        href={`/trainings/${r.courses.id}`}
                        className="mt-2 inline-block text-xs text-blue-600 hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        View training →
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </div>

      {/* ── Add to Training Sheet ────────────────────────────────────────── */}
      <Sheet open={addToTrainingOpen} onOpenChange={setAddToTrainingOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Add to a Training</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loadingUpcoming ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : upcomingTrainings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">No upcoming trainings found.</p>
            ) : (
              <ul className="space-y-3">
                {upcomingTrainings.map(t => {
                  const alreadyAdded = addedToTrainingIds.has(t.id)
                  const isAdding    = addingToTrainingId === t.id
                  const trainerName = t.staff ? getDisplayName(t.staff) : t.trainer_name ?? null
                  return (
                    <li key={t.id} className="rounded-lg border bg-white p-4 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t.date
                            ? new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Date TBD'}
                          {t.start_time && <> · {fmtTime(t.start_time)}</>}
                          {t.units != null && <> · {t.units} unit{t.units === 1 ? '' : 's'}</>}
                        </p>
                        {trainerName && (
                          <p className="text-xs text-gray-400 mt-0.5">Trainer: {trainerName}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={alreadyAdded ? 'outline' : 'default'}
                        className={alreadyAdded ? 'shrink-0' : 'shrink-0 bg-[#0A253D] hover:bg-[#0d2f4f]'}
                        disabled={alreadyAdded || isAdding}
                        onClick={() => handleAddToTraining(t)}
                      >
                        {isAdding
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : alreadyAdded
                          ? 'Added'
                          : 'Add'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Edit Staff Sheet ──────────────────────────────────────────────── */}
      <Sheet open={editStaffOpen} onOpenChange={setEditStaffOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Staff Info</SheetTitle></SheetHeader>
          <div className="space-y-5 px-6 py-5">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Legal Name</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input value={staffForm.first_name} onChange={e => setStaffForm(f => ({ ...f, first_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input value={staffForm.last_name} onChange={e => setStaffForm(f => ({ ...f, last_name: e.target.value }))} />
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Preferred / Goes-by Name</p>
              <p className="text-xs text-gray-400 mb-3">Leave blank to use legal name. Used everywhere except printed certifications.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Preferred First Name</Label>
                  <Input placeholder={staffForm.first_name || 'e.g. Maddie'} value={staffForm.display_first_name} onChange={e => setStaffForm(f => ({ ...f, display_first_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Preferred Last Name</Label>
                  <Input placeholder={staffForm.last_name || 'e.g. Wils'} value={staffForm.display_last_name} onChange={e => setStaffForm(f => ({ ...f, display_last_name: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={staffForm.role} onValueChange={v => setStaffForm(f => ({ ...f, role: v ?? '' }))}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RBT">RBT</SelectItem>
                  <SelectItem value="Trainer">Trainer</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Credentials</Label>
              <Input
                placeholder="e.g. M.A., BCBA, LABA"
                value={staffForm.credentials}
                onChange={e => setStaffForm(f => ({ ...f, credentials: e.target.value }))}
              />
              <p className="text-xs text-gray-400">Letters after the name (not a cert number). Shown on certificates next to the trainer&apos;s name.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>BACB Cert #</Label>
                <Input placeholder="e.g. 1-23-456789" value={staffForm.certification_number} onChange={e => setStaffForm(f => ({ ...f, certification_number: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Original Cert Date</Label>
                <Input type="date" value={staffForm.original_certification_date} onChange={e => setStaffForm(f => ({ ...f, original_certification_date: e.target.value }))} />
              </div>
            </div>
            {staffError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{staffError}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditStaffOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveStaff} disabled={savingStaff} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              {savingStaff ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Cycle Sheet ───────────────────────────────────────────────────── */}
      <Sheet open={cycleDialogOpen} onOpenChange={open => {
        setCycleDialogOpen(open)
        if (!open) setOverlapWarning(null)
      }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingCycle ? 'Edit Cycle' : 'Add Certification Cycle'}</SheetTitle>
          </SheetHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={cycleForm.start_date}
                  onChange={e => { setCycleForm(f => ({ ...f, start_date: e.target.value })); setOverlapWarning(null) }}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={cycleForm.end_date}
                  onChange={e => { setCycleForm(f => ({ ...f, end_date: e.target.value })); setOverlapWarning(null) }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                placeholder="Optional notes…"
                value={cycleForm.notes}
                onChange={e => setCycleForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {/* Overlap warning */}
            {overlapWarning && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800">
                    This person has a cycle ending <strong>{formatDate(overlapWarning.conflictingCycle.end_date)}</strong> that
                    overlaps with these dates. Would you like to update its end date
                    to <strong>{formatDate(overlapWarning.suggestedEndDate)}</strong>?
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setOverlapWarning(null)}>
                    No, I&apos;ll fix it
                  </Button>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => handleSaveCycle(true)} disabled={savingCycle}>
                    {savingCycle ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, update end date'}
                  </Button>
                </div>
              </div>
            )}

            {cycleError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{cycleError}</p>}
          </div>

          {!overlapWarning && (
            <SheetFooter>
              <Button variant="outline" onClick={() => setCycleDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => handleSaveCycle(false)} disabled={savingCycle} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                {savingCycle ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Cycle'}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
