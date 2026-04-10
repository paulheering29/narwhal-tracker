'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { BookPlus, Loader2, Search, ChevronRight, Clock, Paperclip } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffOption = {
  id: string; first_name: string; last_name: string
  display_first_name: string | null; display_last_name: string | null
}

type TopicOption = { id: string; name: string }

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
// Colour is assigned deterministically from the topic's UUID so it never changes.
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrainingsPage() {
  const supabase = createClient()
  const router   = useRouter()

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
            training_document_links(document_id)
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

  useEffect(() => { load() }, [])

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

  // ── Filter ──────────────────────────────────────────────────────────────────

  const filtered = trainings.filter(t => {
    const trainerDisplay = t.staff ? getDisplayName(t.staff) : (t.trainer_name ?? '')
    return `${t.name} ${trainerDisplay} ${t.modality ?? ''}`
      .toLowerCase().includes(search.toLowerCase())
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Trainings</h1>
          <p className="mt-1 text-sm text-gray-500">{trainings.length} total trainings</p>
        </div>
        <Button onClick={openAdd} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
          <BookPlus className="mr-2 h-4 w-4" /> Add Training
        </Button>
      </div>

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
              <TableHead>Docs</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </TableCell></TableRow>
            ) : loadError ? (
              <TableRow><TableCell colSpan={9} className="text-center py-10">
                <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 inline-block">{loadError}</p>
              </TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400">
                {search ? 'No trainings match your search.' : 'No trainings yet. Add your first one.'}
              </TableCell></TableRow>
            ) : filtered.map(t => {
              const trainerDisplay = t.staff
                ? getDisplayName(t.staff)
                : t.trainer_name
                  ? `${t.trainer_name} (Ext.)`
                  : '—'
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
