'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getDisplayName } from '@/lib/display-name'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  ArrowDown, ArrowLeft, ArrowUp, Archive, ArchiveRestore, CheckCircle2, Circle, Loader2, Lock,
  PlayCircle, Plus, Search, UserPlus, X, Pencil,
} from 'lucide-react'

export type CourseStatus = 'done' | 'in_progress' | 'not_started' | 'locked'

type StaffName = {
  id: string; first_name: string; last_name: string
  display_first_name: string | null; display_last_name: string | null; role: string | null
}

export type PathDetail = {
  id: string; name: string; description: string | null; sequential: boolean; archived: boolean
  courses: { id: string; name: string; units: number; ethicsUnits: number; supervisionUnits: number }[]
  assignees: { staffId: string; staff: StaffName; assignedAt: string; completedAt: string | null; statuses: CourseStatus[] }[]
  streamedCourses: { id: string; name: string; units: number }[]
  staff: StaffName[]
}

const fmt = (n: number) => String(Number(n.toFixed(2)))
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_STYLE: Record<CourseStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  done:        { label: 'Done',        cls: 'text-emerald-600', icon: <CheckCircle2 className="h-4 w-4" /> },
  in_progress: { label: 'In progress', cls: 'text-amber-600',   icon: <PlayCircle className="h-4 w-4" /> },
  not_started: { label: 'Not started', cls: 'text-gray-400',    icon: <Circle className="h-4 w-4" /> },
  locked:      { label: 'Locked',      cls: 'text-gray-300',    icon: <Lock className="h-4 w-4" /> },
}

export function PathDetailClient({ path }: { path: PathDetail }) {
  const supabase = createClient()
  const router   = useRouter()

  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── details ──
  const [editOpen, setEditOpen] = useState(false)
  const [name, setName] = useState(path.name)
  const [description, setDescription] = useState(path.description ?? '')
  const [sequential, setSequential]   = useState(path.sequential)

  async function saveDetails() {
    if (!name.trim()) { setError('Give the path a name.'); return }
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('learning_paths')
      .update({ name: name.trim(), description: description.trim() || null, sequential })
      .eq('id', path.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    setEditOpen(false); router.refresh()
  }

  async function toggleArchive() {
    if (!path.archived && !confirm('Archive this path? It disappears from the builder and assign lists. People who already have it keep working through it.')) return
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('learning_paths')
      .update({ archived_at: path.archived ? null : new Date().toISOString() })
      .eq('id', path.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    router.refresh()
  }

  // ── courses ──
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  async function saveCourses(courseIds: string[]) {
    setBusy(true); setError(null)
    const res = await fetch(`/api/paths/${path.id}/courses`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseIds }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'Could not update the courses.'); return false }
    router.refresh()
    return true
  }

  const ids = path.courses.map(c => c.id)
  function move(i: number, dir: -1 | 1) {
    const next = [...ids]; const j = i + dir
    ;[next[i], next[j]] = [next[j], next[i]]
    void saveCourses(next)
  }
  function remove(i: number) {
    const c = path.courses[i]
    const note = path.assignees.length > 0
      ? ' People who haven’t started it will have it taken off their list; anything already started stays with them.'
      : ''
    if (!confirm(`Remove “${c.name}” from this path?${note}`)) return
    void saveCourses(ids.filter(id => id !== c.id))
  }
  async function addCourse(id: string) {
    if (await saveCourses([...ids, id])) setPickerOpen(false)
  }

  // ── assign ──
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignSearch, setAssignSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [assignResult, setAssignResult] = useState<string | null>(null)
  const assignedIds = new Set(path.assignees.map(a => a.staffId))

  function openAssign() { setPicked(new Set()); setAssignSearch(''); setAssignResult(null); setError(null); setAssignOpen(true) }

  async function handleAssign() {
    if (picked.size === 0) return
    setBusy(true); setError(null); setAssignResult(null)
    const res = await fetch(`/api/paths/${path.id}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffIds: Array.from(picked) }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'Could not assign the path.'); return }
    if (json.failed?.length) {
      setAssignResult(`Assigned ${json.assigned.length}. ${json.failed.length} could not be assigned: ${json.failed.map((f: { error: string }) => f.error).join('; ')}`)
      setPicked(new Set())
    } else {
      setAssignOpen(false)
    }
    router.refresh()
  }

  async function handleUnassign(staffId: string, who: string) {
    if (!confirm(`Take this path off ${who}? Courses they’ve already started stay on their list, and nothing they’ve done is removed.`)) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/paths/${path.id}/unassign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'Could not unassign.'); return }
    router.refresh()
  }

  const totalUnits = path.courses.reduce((s, c) => s + c.units, 0)
  const completedCount = path.assignees.filter(a => a.completedAt).length
  const availableToAdd = path.streamedCourses
    .filter(c => !ids.includes(c.id))
    .filter(c => !pickerSearch || c.name.toLowerCase().includes(pickerSearch.toLowerCase()))
  const availableStaff = path.staff
    .filter(s => !assignSearch || getDisplayName(s).toLowerCase().includes(assignSearch.toLowerCase()))

  return (
    <div className="p-4 md:p-8">
      <Link href="/paths" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> Back to Learning Paths
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-gray-900">{path.name}</h1>
            {path.archived && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Archived</span>}
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {path.sequential ? 'Complete in order' : 'Any order'}
            </span>
          </div>
          {path.description && <p className="mt-1 text-sm text-gray-500 max-w-2xl">{path.description}</p>}
          <p className="mt-1 text-xs text-gray-400">
            {path.courses.length} course{path.courses.length !== 1 ? 's' : ''} · {fmt(totalUnits)} unit{totalUnits !== 1 ? 's' : ''}
            {path.courses.some(c => c.ethicsUnits > 0) && <> · {fmt(path.courses.reduce((s, c) => s + c.ethicsUnits, 0))} ethics</>}
            {path.courses.some(c => c.supervisionUnits > 0) && <> · {fmt(path.courses.reduce((s, c) => s + c.supervisionUnits, 0))} supervision</>}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => { setName(path.name); setDescription(path.description ?? ''); setSequential(path.sequential); setError(null); setEditOpen(true) }}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={toggleArchive} disabled={busy}>
            {path.archived ? <><ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />Restore</> : <><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</>}
          </Button>
        </div>
      </div>

      {error && !assignOpen && !editOpen && <p className="mb-4 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      {/* ── Courses ── */}
      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Courses</h2>
          <Button size="sm" onClick={() => { setPickerSearch(''); setError(null); setPickerOpen(true) }} disabled={busy || path.archived}
            className="bg-[#025CA8] hover:bg-[#024A87]">
            <Plus className="mr-1.5 h-4 w-4" /> Add course
          </Button>
        </div>
        {path.courses.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-gray-400">
            No courses yet. Add the self-paced courses people should complete.
          </div>
        ) : (
          <ol className="rounded-lg border bg-white shadow-sm divide-y divide-gray-100">
            {path.courses.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/courses/${c.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block">{c.name}</Link>
                  <p className="text-xs text-gray-400">
                    {fmt(c.units)} unit{c.units !== 1 ? 's' : ''}
                    {c.ethicsUnits > 0 && <> · {fmt(c.ethicsUnits)} ethics</>}
                    {c.supervisionUnits > 0 && <> · {fmt(c.supervisionUnits)} supervision</>}
                  </p>
                </div>
                <button onClick={() => move(i, -1)} disabled={busy || i === 0} title="Move up"
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => move(i, 1)} disabled={busy || i === path.courses.length - 1} title="Move down"
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button onClick={() => remove(i)} disabled={busy} title="Remove"
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── Assignees & progress ── */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Assigned</h2>
            <p className="text-sm text-gray-500">{path.assignees.length} assigned · {completedCount} completed</p>
          </div>
          <Button size="sm" onClick={openAssign} disabled={path.archived || path.courses.length === 0} className="bg-[#025CA8] hover:bg-[#024A87]">
            <UserPlus className="mr-1.5 h-4 w-4" /> Assign people
          </Button>
        </div>
        {path.assignees.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-gray-400">No one has this path yet.</div>
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-2.5">Person</th>
                  {path.courses.map((c, i) => (
                    <th key={c.id} className="px-3 py-2.5 text-center max-w-[10rem]">
                      <span className="block truncate" title={c.name}>{i + 1}. {c.name}</span>
                    </th>
                  ))}
                  <th className="px-4 py-2.5">Path</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...path.assignees]
                  .sort((a, b) => getDisplayName(a.staff).localeCompare(getDisplayName(b.staff)))
                  .map(a => {
                    const who = getDisplayName(a.staff)
                    const doneCount = a.statuses.filter(s => s === 'done').length
                    return (
                      <tr key={a.staffId}>
                        <td className="px-4 py-2.5">
                          <Link href={`/staff/${a.staffId}`} className="font-medium text-blue-600 hover:underline">{who}</Link>
                          {a.staff.role && <span className="ml-2 text-xs text-gray-400">{a.staff.role}</span>}
                        </td>
                        {a.statuses.map((st, i) => (
                          <td key={i} className="px-3 py-2.5 text-center">
                            <span className={`inline-flex ${STATUS_STYLE[st].cls}`} title={STATUS_STYLE[st].label}>{STATUS_STYLE[st].icon}</span>
                          </td>
                        ))}
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {a.completedAt
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" /> Completed {fmtDate(a.completedAt)}
                              </span>
                            : <span className="text-xs text-gray-500">{doneCount} of {path.courses.length}</span>}
                        </td>
                        <td className="px-2">
                          <button onClick={() => handleUnassign(a.staffId, who)} disabled={busy} title="Unassign"
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"><X className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
          {(['done', 'in_progress', 'not_started', 'locked'] as CourseStatus[]).map(s => (
            <span key={s} className={`inline-flex items-center gap-1 ${STATUS_STYLE[s].cls}`}>{STATUS_STYLE[s].icon}<span className="text-gray-500">{STATUS_STYLE[s].label}</span></span>
          ))}
        </div>
      </section>

      {/* ── Edit details ── */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>Edit Path</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-4 px-6 py-5">
            <div className="space-y-2"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} /></div>
            <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer">
              <input type="checkbox" checked={sequential} onChange={e => setSequential(e.target.checked)} className="mt-0.5 accent-[#025CA8]" />
              <div>
                <p className="text-sm font-medium text-gray-800">Complete in order</p>
                <p className="text-xs text-gray-500">Each course unlocks when the one before it is finished.</p>
              </div>
            </label>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveDetails} disabled={busy} className="bg-[#025CA8] hover:bg-[#024A87]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Add course ── */}
      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>Add a Course</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-3 px-6 py-5">
            <p className="text-xs text-gray-500">Only self-paced courses can be part of a path. It’s added to the end.</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input placeholder="Search courses…" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} className="pl-8" />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
            {availableToAdd.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">{pickerSearch ? 'No courses match.' : 'Every self-paced course is already in this path.'}</p>
            ) : availableToAdd.map(c => (
              <button key={c.id} onClick={() => addCourse(c.id)} disabled={busy}
                className="w-full flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm hover:bg-gray-50 disabled:opacity-50">
                <span className="truncate">{c.name}</span>
                <span className="ml-3 shrink-0 text-xs text-gray-400">{fmt(c.units)} unit{c.units !== 1 ? 's' : ''}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Assign ── */}
      <Sheet open={assignOpen} onOpenChange={setAssignOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>Assign “{path.name}”</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-3 px-6 py-5">
            <p className="text-xs text-gray-500">
              Each person gets every course in the path. Courses they already have or have already passed are left as they are.
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input placeholder="Search staff…" value={assignSearch} onChange={e => setAssignSearch(e.target.value)} className="pl-8" />
            </div>
            {assignResult && <p className="text-sm text-amber-800 bg-amber-50 rounded px-3 py-2">{assignResult}</p>}
            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
            <ul className="space-y-0.5">
              {availableStaff.map(s => {
                const already = assignedIds.has(s.id)
                return (
                  <li key={s.id}>
                    <label className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${already ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                      <input type="checkbox" disabled={already} checked={already || picked.has(s.id)} className="accent-[#025CA8]"
                        onChange={e => setPicked(prev => { const n = new Set(prev); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n })} />
                      <span className="flex-1 truncate">{getDisplayName(s)}</span>
                      {s.role && <span className="text-xs text-gray-400">{s.role}</span>}
                      {already && <span className="text-xs text-gray-500">Already assigned</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Close</Button>
            <Button onClick={handleAssign} disabled={busy || picked.size === 0} className="bg-[#025CA8] hover:bg-[#024A87]">
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Assigning…</> : `Assign${picked.size ? ` (${picked.size})` : ''}`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
