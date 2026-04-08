'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { getDisplayName } from '@/lib/display-name'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft, Pencil, Loader2, Upload, FileText, Download,
  Link2, Link2Off, Clock, Calendar, CheckCircle2, Circle, Search, Award,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffOption = {
  id: string; first_name: string; last_name: string
  display_first_name: string | null; display_last_name: string | null
}

type TopicOption = { id: string; name: string }

type Training = {
  id: string; name: string; description: string | null
  date: string | null; start_time: string | null; end_time: string | null
  units: number | null; modality: string | null; validity_months: number | null
  trainer_staff_id: string | null; trainer_name: string | null; trainer_cert_number: string | null
  topic_id: string | null
  staff: StaffOption | null
}

type Attendee = {
  id: string
  staff_id: string
  confirmed: boolean
  completed_date: string
  staff: StaffOption
}

type LinkedDoc = {
  document_id: string
  training_documents: {
    id: string; name: string; file_path: string; file_size: number | null; created_at: string
  }
}

type AvailableDoc = {
  id: string; name: string; file_path: string; file_size: number | null; created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODALITY_LABELS: Record<string, string> = {
  'in-person':           'In-person',
  'online-synchronous':  'Online synchronous',
  'online-asynchronous': 'Online asynchronous',
}
const MODALITY_STYLES: Record<string, string> = {
  'in-person':           'bg-emerald-100 text-emerald-700',
  'online-synchronous':  'bg-blue-100 text-blue-700',
  'online-asynchronous': 'bg-violet-100 text-violet-700',
}
const CERT_STYLES: Record<string, string> = {
  RBT:  'bg-blue-100 text-blue-700',
  BCBA: 'bg-violet-100 text-violet-700',
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
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtBytes(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrainingDetailPage() {
  const { id: trainingId } = useParams() as { id: string }
  const router   = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Core data ───────────────────────────────────────────────────────────────
  const [training, setTraining]   = useState<Training | null>(null)
  const [docs, setDocs]           = useState<LinkedDoc[]>([])
  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [loading, setLoading]     = useState(true)

  // ── Attendees ────────────────────────────────────────────────────────────────
  const [attendees, setAttendees]           = useState<Attendee[]>([])
  const [activeCycleMap, setActiveCycleMap] = useState<Record<string, string>>({})
  const [staffSearch, setStaffSearch]       = useState('')
  const [certFilter, setCertFilter]         = useState<'all' | 'RBT' | 'BCBA'>('all')
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set())
  const [addingAttendees, setAddingAttendees]   = useState(false)
  const [attendeeError, setAttendeeError]       = useState<string | null>(null)

  // ── Edit dialog ──────────────────────────────────────────────────────────────
  const [editOpen, setEditOpen]       = useState(false)
  const [form, setForm]               = useState(emptyForm)
  const [trainerType, setTrainerType] = useState<'staff' | 'external'>('staff')
  const [topicList, setTopicList]     = useState<TopicOption[]>([])
  const [saving, setSaving]           = useState(false)
  const [editError, setEditError]     = useState<string | null>(null)

  // ── Documents ────────────────────────────────────────────────────────────────
  const [uploading, setUploading]               = useState(false)
  const [docError, setDocError]                 = useState<string | null>(null)
  const [linkDialogOpen, setLinkDialogOpen]     = useState(false)
  const [availableDocs, setAvailableDocs]       = useState<AvailableDoc[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadTraining = useCallback(async () => {
    const { data } = await supabase
      .from('courses')
      .select('*, staff:trainer_staff_id(id, first_name, last_name, display_first_name, display_last_name)')
      .eq('id', trainingId)
      .single()
    if (data) setTraining(data as unknown as Training)
  }, [trainingId])

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from('training_document_links')
      .select('document_id, training_documents(id, name, file_path, file_size, created_at)')
      .eq('training_id', trainingId)
      .order('created_at', { referencedTable: 'training_documents', ascending: false })
    setDocs((data ?? []) as unknown as LinkedDoc[])
  }, [trainingId])

  const loadStaff = useCallback(async () => {
    const { data } = await supabase
      .from('staff')
      .select('id, first_name, last_name, display_first_name, display_last_name')
      .eq('active', true)
      .order('last_name')
    setStaffList(data ?? [])
  }, [])

  const loadAttendees = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]
    const [attendeesRes, cyclesRes] = await Promise.all([
      supabase
        .from('training_records')
        .select('id, staff_id, confirmed, completed_date, staff:staff_id(id, first_name, last_name, display_first_name, display_last_name)')
        .eq('course_id', trainingId),
      supabase
        .from('certification_cycles')
        .select('staff_id, certification_type, start_date, end_date')
        .lte('start_date', today)
        .gte('end_date', today),
    ])
    const cycleMap: Record<string, string> = {}
    for (const c of cyclesRes.data ?? []) cycleMap[c.staff_id] = c.certification_type
    setActiveCycleMap(cycleMap)
    setAttendees((attendeesRes.data ?? []) as unknown as Attendee[])
  }, [trainingId])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const [,,,, topicsRes] = await Promise.all([
        loadTraining(), loadDocs(), loadStaff(), loadAttendees(),
        supabase.from('topics').select('id, name').order('name'),
      ])
      setTopicList((topicsRes as { data: TopicOption[] | null }).data ?? [])
      setLoading(false)
    }
    init()
  }, [loadTraining, loadDocs, loadStaff, loadAttendees])

  // ── Edit training ─────────────────────────────────────────────────────────────

  function openEdit() {
    if (!training) return
    setForm({
      name:               training.name,
      description:        training.description ?? '',
      date:               training.date ?? '',
      start_time:         training.start_time?.slice(0, 5) ?? '',
      end_time:           training.end_time?.slice(0, 5) ?? '',
      units:              training.units?.toString() ?? '',
      validity_months:    training.validity_months?.toString() ?? '',
      modality:           training.modality ?? '',
      trainer_staff_id:   training.trainer_staff_id ?? '',
      trainer_name:       training.trainer_name ?? '',
      trainer_cert_number: training.trainer_cert_number ?? '',
      topic_id:           training.topic_id ?? '',
    })
    setTrainerType(training.trainer_staff_id ? 'staff' : 'external')
    setEditError(null)
    setEditOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.date || !form.start_time || !form.end_time || !form.units || !form.modality) {
      setEditError('Please fill in all required fields.')
      return
    }
    setSaving(true)
    setEditError(null)
    const { error } = await supabase.from('courses').update({
      name:                form.name.trim(),
      description:         form.description || null,
      date:                form.date,
      start_time:          form.start_time,
      end_time:            form.end_time,
      units:               parseFloat(form.units),
      validity_months:     form.validity_months ? parseInt(form.validity_months) : null,
      modality:            form.modality,
      trainer_staff_id:    trainerType === 'staff'    ? form.trainer_staff_id || null : null,
      trainer_name:        trainerType === 'external' ? form.trainer_name || null     : null,
      trainer_cert_number: trainerType === 'external' ? form.trainer_cert_number || null : null,
      topic_id:            form.topic_id || null,
    }).eq('id', trainingId)
    if (error) { setEditError(error.message); setSaving(false); return }
    setSaving(false)
    setEditOpen(false)
    loadTraining()
  }

  // ── Attendees ─────────────────────────────────────────────────────────────────

  async function toggleConfirmed(attendee: Attendee) {
    const next = !attendee.confirmed
    setAttendees(prev => prev.map(a => a.id === attendee.id ? { ...a, confirmed: next } : a))
    const { error } = await supabase
      .from('training_records')
      .update({ confirmed: next })
      .eq('id', attendee.id)
    if (error) {
      setAttendees(prev => prev.map(a => a.id === attendee.id ? { ...a, confirmed: attendee.confirmed } : a))
      setAttendeeError(error.message)
    }
  }

  function toggleStaffSelection(staffId: string) {
    setSelectedStaffIds(prev => {
      const next = new Set(prev)
      next.has(staffId) ? next.delete(staffId) : next.add(staffId)
      return next
    })
  }

  async function handleAddAttendees() {
    if (selectedStaffIds.size === 0) return
    setAddingAttendees(true)
    setAttendeeError(null)
    const companyId = await getCompanyId()
    if (!companyId) {
      setAttendeeError('Could not determine company. Please sign out and back in.')
      setAddingAttendees(false)
      return
    }
    const completedDate = training?.date ?? new Date().toISOString().split('T')[0]
    const expiryDate = training?.validity_months && training?.date
      ? (() => {
          const d = new Date(training.date + 'T00:00:00')
          d.setMonth(d.getMonth() + training.validity_months!)
          return d.toISOString().split('T')[0]
        })()
      : null
    const rows = Array.from(selectedStaffIds).map(staffId => ({
      company_id: companyId, staff_id: staffId, course_id: trainingId,
      completed_date: completedDate, expiry_date: expiryDate, confirmed: false,
    }))
    const { error } = await supabase.from('training_records').insert(rows)
    if (error) { setAttendeeError(error.message); setAddingAttendees(false); return }
    setAddingAttendees(false)
    setSelectedStaffIds(new Set())
    loadAttendees()
  }

  // Staff not yet added, filtered by cert type and search
  const attendeeStaffIds = new Set(attendees.map(a => a.staff_id))
  const availableStaff = staffList
    .filter(s => !attendeeStaffIds.has(s.id))
    .filter(s => certFilter === 'all' || activeCycleMap[s.id] === certFilter)
    .filter(s => staffSearch === '' ||
      getDisplayName(s).toLowerCase().includes(staffSearch.toLowerCase()))

  // ── Documents ─────────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setDocError('Only PDF files are supported.'); return
    }
    setUploading(true); setDocError(null)
    const companyId = await getCompanyId()
    if (!companyId) { setDocError('Could not determine company.'); setUploading(false); return }
    const filePath = `${companyId}/${crypto.randomUUID()}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('training-documents').upload(filePath, file, { contentType: 'application/pdf' })
    if (uploadErr) { setDocError(uploadErr.message); setUploading(false); return }
    const { data: doc, error: docErr } = await supabase
      .from('training_documents')
      .insert({ company_id: companyId, name: file.name, file_path: filePath, file_size: file.size })
      .select('id').single()
    if (docErr) { setDocError(docErr.message); setUploading(false); return }
    const { error: linkErr } = await supabase
      .from('training_document_links')
      .insert({ training_id: trainingId, document_id: doc.id, company_id: companyId })
    if (linkErr) { setDocError(linkErr.message); setUploading(false); return }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    loadDocs()
  }

  async function handleDownload(filePath: string) {
    const { data } = await supabase.storage.from('training-documents').createSignedUrl(filePath, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleUnlink(documentId: string) {
    await supabase.from('training_document_links')
      .delete().eq('training_id', trainingId).eq('document_id', documentId)
    loadDocs()
  }

  async function openLinkDialog() {
    setLinkDialogOpen(true); setLoadingAvailable(true)
    const companyId = await getCompanyId()
    const linkedIds = docs.map(d => d.document_id)
    const { data } = await supabase.from('training_documents')
      .select('id, name, file_path, file_size, created_at')
      .eq('company_id', companyId!)
      .order('created_at', { ascending: false })
    setAvailableDocs((data ?? []).filter(d => !linkedIds.includes(d.id)) as AvailableDoc[])
    setLoadingAvailable(false)
  }

  async function handleLinkExisting(doc: AvailableDoc) {
    const companyId = await getCompanyId()
    await supabase.from('training_document_links')
      .insert({ training_id: trainingId, document_id: doc.id, company_id: companyId! })
    setLinkDialogOpen(false); loadDocs()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  }

  if (!training) {
    return <div className="p-8">
      <p className="text-gray-500">Training not found.</p>
      <Button variant="link" onClick={() => router.push('/trainings')}>← Back</Button>
    </div>
  }

  const trainerDisplay = training.staff ? getDisplayName(training.staff) : training.trainer_name ?? null
  const confirmedCount = attendees.filter(a => a.confirmed).length

  return (
    <div className="p-8 max-w-6xl">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <button onClick={() => router.push('/trainings')}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Trainings
      </button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{training.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-gray-500">
            {training.date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />{fmtDate(training.date)}
              </span>
            )}
            {training.start_time && training.end_time && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />{fmtTime(training.start_time)} – {fmtTime(training.end_time)}
              </span>
            )}
            {training.modality && (
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${MODALITY_STYLES[training.modality] ?? ''}`}>
                {MODALITY_LABELS[training.modality] ?? training.modality}
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit} className="shrink-0">
          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
        </Button>
      </div>

      {/* ── Details card ─────────────────────────────────────────────────────── */}
      <Card className="mb-8 shadow-sm">
        <CardContent className="pt-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">PDUs</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {training.units != null ? `${training.units} PDU${training.units !== 1 ? 's' : ''}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Topic</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {topicList.find(t => t.id === training.topic_id)?.name ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Trainer</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {trainerDisplay ?? '—'}
                {training.trainer_cert_number && (
                  <span className="ml-1 text-xs text-gray-400">({training.trainer_cert_number})</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Documents</dt>
              <dd className="mt-1 text-sm text-gray-900">{docs.length}</dd>
            </div>
            {training.description && (
              <div className="col-span-4">
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</dt>
                <dd className="mt-1 text-sm text-gray-700">{training.description}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* ── Attendees (two-panel) ─────────────────────────────────────────────── */}
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Attendees</h2>
      {attendeeError && (
        <p className="mb-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{attendeeError}</p>
      )}

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Left: current attendees */}
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-sm font-medium text-gray-700">
              {attendees.length} added
              {attendees.length > 0 && (
                <span className="ml-2 text-gray-400 font-normal">
                  · {confirmedCount} confirmed
                </span>
              )}
            </p>
          </div>
          {attendees.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              No attendees yet. Search and add staff from the panel on the right.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Cert</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead className="text-right">Certificate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...attendees]
                  .sort((a, b) => getDisplayName(a.staff).localeCompare(getDisplayName(b.staff)))
                  .map(attendee => {
                    const certType = activeCycleMap[attendee.staff_id]
                    return (
                      <TableRow key={attendee.id}>
                        <TableCell className="font-medium text-sm">
                          {getDisplayName(attendee.staff)}
                        </TableCell>
                        <TableCell>
                          {certType ? (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CERT_STYLES[certType] ?? 'bg-gray-100 text-gray-600'}`}>
                              {certType}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleConfirmed(attendee)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                              attendee.confirmed
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            }`}
                          >
                            {attendee.confirmed
                              ? <><CheckCircle2 className="h-3.5 w-3.5" /> Confirmed</>
                              : <><Circle className="h-3.5 w-3.5" /> Pending</>
                            }
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          {attendee.confirmed && certType === 'RBT' ? (
                            <a
                              href={`/api/certificates/rbt-inservice?recordId=${attendee.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Download BACB RBT In-Service Form"
                              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                            >
                              <Award className="h-3.5 w-3.5" /> RBT Form
                            </a>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Right: add staff */}
        <div className="rounded-lg border bg-white shadow-sm flex flex-col">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-sm font-medium text-gray-700">Add Staff</p>
          </div>
          <div className="p-4 space-y-3 flex flex-col flex-1">
            {/* Search + cert filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="Search staff…"
                  value={staffSearch}
                  onChange={e => setStaffSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="flex rounded-md border overflow-hidden">
                {(['all', 'RBT', 'BCBA'] as const).map(f => (
                  <button key={f} type="button" onClick={() => setCertFilter(f)}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      certFilter === f ? 'bg-[#0A253D] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}>
                    {f === 'all' ? 'All' : f}
                  </button>
                ))}
              </div>
            </div>

            {/* Staff list */}
            <div className="flex-1 overflow-y-auto space-y-0.5 max-h-72">
              {availableStaff.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  {staffSearch
                    ? 'No staff match your search.'
                    : certFilter !== 'all'
                      ? `No ${certFilter} staff left to add.`
                      : 'All active staff have been added.'}
                </p>
              ) : (
                availableStaff.map(s => {
                  const certType = activeCycleMap[s.id]
                  const selected = selectedStaffIds.has(s.id)
                  return (
                    <button key={s.id} type="button"
                      onClick={() => toggleStaffSelection(s.id)}
                      className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                        selected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                      }`}>
                      {/* Checkbox */}
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selected ? 'border-[#0A253D] bg-[#0A253D]' : 'border-gray-300'
                      }`}>
                        {selected && (
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="flex-1 text-sm">{getDisplayName(s)}</span>
                      {certType && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CERT_STYLES[certType] ?? 'bg-gray-100 text-gray-600'}`}>
                          {certType}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Add button */}
            <Button
              onClick={handleAddAttendees}
              disabled={selectedStaffIds.size === 0 || addingAttendees}
              className="w-full bg-[#0A253D] hover:bg-[#0d2f4f]">
              {addingAttendees
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</>
                : selectedStaffIds.size > 0
                  ? `Add ${selectedStaffIds.size} Staff Member${selectedStaffIds.size !== 1 ? 's' : ''}`
                  : 'Select Staff to Add'
              }
            </Button>
          </div>
        </div>
      </div>

      {/* ── Documents ────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
          <p className="text-sm text-gray-500">{docs.length} file{docs.length !== 1 ? 's' : ''} attached</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openLinkDialog}>
            <Link2 className="mr-2 h-4 w-4" /> Link Existing
          </Button>
          <Button size="sm" className="bg-[#0A253D] hover:bg-[#0d2f4f]"
            onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</>
              : <><Upload className="mr-2 h-4 w-4" />Upload PDF</>}
          </Button>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
            className="hidden" onChange={handleFileChange} />
        </div>
      </div>

      {docError && <p className="mb-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{docError}</p>}

      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          No documents attached. Upload a PDF or link an existing one.
        </div>
      ) : (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map(d => {
                const doc = d.training_documents
                return (
                  <TableRow key={d.document_id}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-red-400 shrink-0" />
                        <span className="font-medium text-sm">{doc.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">{fmtBytes(doc.file_size)}</TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" title="Download"
                        onClick={() => handleDownload(doc.file_path)}>
                        <Download className="h-4 w-4 text-blue-500" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Unlink"
                        onClick={() => handleUnlink(d.document_id)}>
                        <Link2Off className="h-4 w-4 text-gray-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Edit Training Dialog ──────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Training</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Training Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time *</Label>
                <Input type="time" value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Time *</Label>
                <Input type="time" value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PDUs *</Label>
                <Input type="number" min="0" step="0.25" value={form.units}
                  onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
              </div>
              {topicList.length > 0 && (
                <div className="space-y-2">
                  <Label>Topic</Label>
                  <Select
                    value={form.topic_id}
                    onValueChange={v => setForm(f => ({ ...f, topic_id: v === '__none__' ? '' : v }))}
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
            </div>
            <div className="space-y-3">
              <Label>Trainer</Label>
              <div className="flex rounded-md border overflow-hidden w-fit">
                {(['staff', 'external'] as const).map(type => (
                  <button key={type} type="button" onClick={() => setTrainerType(type)}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${trainerType === type ? 'bg-[#0A253D] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {type === 'staff' ? 'Staff Member' : 'External'}
                  </button>
                ))}
              </div>
              {trainerType === 'staff' ? (
                <Select value={form.trainer_staff_id}
                  onValueChange={v => setForm(f => ({ ...f, trainer_staff_id: v ?? '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map(s => <SelectItem key={s.id} value={s.id}>{getDisplayName(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Trainer Name</Label>
                    <Input value={form.trainer_name}
                      onChange={e => setForm(f => ({ ...f, trainer_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cert Number</Label>
                    <Input value={form.trainer_cert_number}
                      onChange={e => setForm(f => ({ ...f, trainer_cert_number: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
            {editError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link Existing Doc Dialog ──────────────────────────────────────────── */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Link Existing Document</DialogTitle></DialogHeader>
          {loadingAvailable ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : availableDocs.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No other documents available to link.</p>
          ) : (
            <div className="space-y-2 py-2">
              {availableDocs.map(doc => (
                <button key={doc.id} onClick={() => handleLinkExisting(doc)}
                  className="w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <FileText className="h-5 w-5 text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-gray-400">{fmtBytes(doc.file_size)}</p>
                  </div>
                  <Link2 className="h-4 w-4 text-blue-500 shrink-0" />
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
