'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, Plus, Route } from 'lucide-react'

type PathProgress = {
  assignmentId: string
  pathId: string
  name: string
  completedAt: string | null
  done: number
  total: number
}
type PathOption = { id: string; name: string }

/**
 * A person's learning paths and how far along they are, with a way to assign
 * another one. Shown on the staff profile (admins only reach that page).
 */
export function StaffPaths({ staffId }: { staffId: string }) {
  const supabase = createClient()
  const [rows, setRows]       = useState<PathProgress[]>([])
  const [options, setOptions] = useState<PathOption[]>([])
  const [loading, setLoading] = useState(true)
  const [choice, setChoice]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: assignments }, { data: paths }] = await Promise.all([
      supabase.from('learning_path_assignments')
        .select('id, path_id, completed_at, learning_paths(name)')
        .eq('staff_id', staffId),
      supabase.from('learning_paths').select('id, name').is('archived_at', null).order('name'),
    ])
    const pathIds = (assignments ?? []).map(a => a.path_id)
    const { data: pathCourses } = pathIds.length
      ? await supabase.from('learning_path_courses').select('path_id, course_id').in('path_id', pathIds)
      : { data: [] }
    const courseIds = Array.from(new Set((pathCourses ?? []).map(c => c.course_id)))
    const { data: confirmed } = courseIds.length
      ? await supabase.from('training_records').select('course_id').eq('staff_id', staffId).eq('confirmed', true).in('course_id', courseIds)
      : { data: [] }
    const done = new Set((confirmed ?? []).map(r => r.course_id as string))

    setRows((assignments ?? []).map(a => {
      const mine = (pathCourses ?? []).filter(c => c.path_id === a.path_id)
      const p = Array.isArray(a.learning_paths) ? a.learning_paths[0] : a.learning_paths
      return {
        assignmentId: a.id, pathId: a.path_id, name: p?.name ?? 'Learning path',
        completedAt: a.completed_at, total: mine.length, done: mine.filter(c => done.has(c.course_id as string)).length,
      }
    }))
    const assigned = new Set(pathIds)
    setOptions((paths ?? []).filter(p => !assigned.has(p.id)))
    setLoading(false)
  }, [staffId])

  useEffect(() => { load() }, [load])

  async function assign() {
    if (!choice) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/paths/${choice}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffIds: [staffId] }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'Could not assign the path.'); return }
    if (json.failed?.length) { setError(json.failed[0].error ?? 'Could not assign the path.'); return }
    setChoice('')
    load()
  }

  return (
    <div className="rounded-xl border-2 border-gray-100 shadow-sm bg-white">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-900">Learning Paths</p>
          <p className="text-xs text-gray-500">Self-paced courses assigned together, in order</p>
        </div>
        <Link href="/paths" className="text-xs text-blue-600 hover:underline shrink-0">Manage paths</Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-5 text-sm text-gray-400 text-center">No learning paths assigned.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map(r => (
            <li key={r.assignmentId} className="px-5 py-3">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-gray-400 shrink-0" />
                <Link href={`/paths/${r.pathId}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate">{r.name}</Link>
                {r.completedAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> Complete
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-500 tabular-nums">{r.done} of {r.total}</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full ${r.completedAt ? 'bg-emerald-500' : 'bg-[#025CA8]'}`}
                  style={{ width: `${r.total ? Math.max(2, (r.done / r.total) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {options.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/60">
          <select value={choice} onChange={e => setChoice(e.target.value)}
            className="h-8 flex-1 min-w-0 rounded-lg border border-input bg-white px-2 text-sm">
            <option value="">Assign a path…</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <Button size="sm" onClick={assign} disabled={!choice || busy} className="bg-[#025CA8] hover:bg-[#024A87] shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" />Assign</>}
          </Button>
        </div>
      )}
      {error && <p className="mx-5 mb-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
    </div>
  )
}
