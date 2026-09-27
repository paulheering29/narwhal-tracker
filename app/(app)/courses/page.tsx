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
import { FilePlus2, Loader2, Search, ChevronRight, PlayCircle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffOption = {
  id: string; first_name: string; last_name: string
  display_first_name: string | null; display_last_name: string | null
}

type TopicOption = { id: string; name: string }

type StreamedCourse = {
  id: string
  name: string
  description: string | null
  units: number | null
  validity_months: number | null
  topic_id: string | null
  trainer_staff_id: string | null
  trainer_name: string | null
  staff: StaffOption | null
  course_videos: { id: string }[]
}

const emptyForm = {
  name: '', description: '', objectives: '', units: '', validity_months: '',
  trainer_staff_id: '', trainer_name: '', trainer_cert_number: '', topic_id: '',
}

export default function CoursesPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [courses, setCourses]     = useState<StreamedCourse[]>([])
  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [topicList, setTopicList] = useState<TopicOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')

  const [dialogOpen, setDialogOpen]   = useState(false)
  const [form, setForm]               = useState(emptyForm)
  const [trainerType, setTrainerType] = useState<'staff' | 'external' | 'none'>('none')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [loadError, setLoadError]     = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const [coursesRes, staffRes, topicsRes] = await Promise.all([
        supabase
          .from('courses')
          .select(`
            id, name, description, units, validity_months, topic_id,
            trainer_staff_id, trainer_name,
            staff:trainer_staff_id(id, first_name, last_name, display_first_name, display_last_name),
            course_videos(id)
          `)
          .eq('course_type', 'streamed')
          .order('name'),
        supabase
          .from('staff')
          .select('id, first_name, last_name, display_first_name, display_last_name')
          .eq('active', true)
          .order('last_name'),
        supabase.from('topics').select('id, name').order('name'),
      ])
      if (coursesRes.error) throw new Error(coursesRes.error.message)
      setCourses((coursesRes.data ?? []) as unknown as StreamedCourse[])
      setStaffList(staffRes.data ?? [])
      setTopicList(topicsRes.data ?? [])
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load courses.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setForm(emptyForm)
    setTrainerType('none')
    setError(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Course name is required.'); return }
    if (!form.units)       { setError('PDUs are required.'); return }

    setSaving(true)
    setError(null)

    const companyId = await getCompanyId()
    if (!companyId) {
      setError('Could not determine your company. Please sign out and back in.')
      setSaving(false)
      return
    }

    const { data: newCourse, error: err } = await supabase.from('courses').insert({
      company_id:          companyId,
      course_type:         'streamed',
      modality:             'online-asynchronous',
      name:                 form.name.trim(),
      description:          form.description || null,
      objectives:           form.objectives || null,
      units:                parseFloat(form.units),
      validity_months:      form.validity_months ? parseInt(form.validity_months) : null,
      trainer_staff_id:     trainerType === 'staff'    ? form.trainer_staff_id || null : null,
      trainer_name:         trainerType === 'external' ? form.trainer_name || null     : null,
      trainer_cert_number:  trainerType === 'external' ? form.trainer_cert_number || null : null,
      topic_id:             form.topic_id || null,
    }).select('id').single()

    if (err) { setError(err.message); setSaving(false); return }

    setSaving(false)
    setDialogOpen(false)
    router.push(`/courses/${newCourse.id}`)
  }

  const filtered = courses.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Courses</h1>
          <p className="mt-1 text-sm text-gray-500">{courses.length} self-paced streamed courses</p>
        </div>
        <Button onClick={openAdd} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
          <FilePlus2 className="mr-2 h-4 w-4" /> Add Course
        </Button>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search courses…" value={search}
          onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course Name</TableHead>
              <TableHead>PDUs</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Trainer</TableHead>
              <TableHead>Sections</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-gray-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </TableCell></TableRow>
            ) : loadError ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10">
                <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 inline-block">{loadError}</p>
              </TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-gray-400">
                {search ? 'No courses match your search.' : 'No streamed courses yet. Add your first one.'}
              </TableCell></TableRow>
            ) : filtered.map(c => {
              const trainerDisplay = c.staff
                ? getDisplayName(c.staff)
                : c.trainer_name ? `${c.trainer_name} (Ext.)` : '—'
              const topic = c.topic_id ? topicList.find(t => t.id === c.topic_id) : null
              return (
                <TableRow key={c.id} className="cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/courses/${c.id}`)}>
                  <TableCell className="font-medium text-blue-600">{c.name}</TableCell>
                  <TableCell className="text-gray-600">{c.units != null ? `${c.units} PDU${c.units !== 1 ? 's' : ''}` : '—'}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{topic?.name ?? '—'}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{trainerDisplay}</TableCell>
                  <TableCell className="text-gray-600 text-sm">
                    <span className="flex items-center gap-1">
                      <PlayCircle className="h-3.5 w-3.5 text-gray-400" />
                      {c.course_videos?.length ?? 0}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => router.push(`/courses/${c.id}`)}>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Add Course Sheet ──────────────────────────────────────────────── */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Streamed Course</SheetTitle></SheetHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <Label>Course Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} placeholder="Optional description…"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Objectives</Label>
              <Textarea rows={3} placeholder="List the learning objectives for this course…"
                value={form.objectives} onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PDUs *</Label>
                <Input type="number" min="0" step="0.25" placeholder="e.g. 1.5"
                  value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
              </div>
              {topicList.length > 0 && (
                <div className="space-y-2">
                  <Label>Topic</Label>
                  <Select value={form.topic_id} onValueChange={v => setForm(f => ({ ...f, topic_id: (!v || v === '__none__') ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select a topic (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {topicList.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label>Trainer of Record <span className="text-gray-400 font-normal">(shown on the certificate, optional)</span></Label>
              <div className="flex rounded-md border overflow-hidden w-fit">
                {(['none', 'staff', 'external'] as const).map(type => (
                  <button key={type} type="button" onClick={() => setTrainerType(type)}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${trainerType === type ? 'bg-[#0A253D] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {type === 'none' ? 'None' : type === 'staff' ? 'Staff Member' : 'External'}
                  </button>
                ))}
              </div>
              {trainerType === 'staff' && (
                <Select value={form.trainer_staff_id} onValueChange={v => setForm(f => ({ ...f, trainer_staff_id: v ?? '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map(s => <SelectItem key={s.id} value={s.id}>{getDisplayName(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {trainerType === 'external' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Trainer Name</Label>
                    <Input value={form.trainer_name} onChange={e => setForm(f => ({ ...f, trainer_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cert Number</Label>
                    <Input value={form.trainer_cert_number} onChange={e => setForm(f => ({ ...f, trainer_cert_number: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Certification Validity <span className="text-gray-400 font-normal">(months, optional)</span></Label>
              <Input type="number" min="0" placeholder="e.g. 12"
                value={form.validity_months} onChange={e => setForm(f => ({ ...f, validity_months: e.target.value }))} />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create Course'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
