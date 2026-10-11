'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { topicFrequencyLabel, type RequirementTopic } from '@/lib/licensure'
import { Loader2 } from 'lucide-react'

type Row = RequirementTopic & { state: string }

/**
 * "This course satisfies these state requirements." When a BCBA completes the
 * course, each ticked topic is marked done on their license in that state
 * (a database trigger does it, however the course is completed). Ticking a
 * topic also credits people who already completed the course.
 */
export function CourseLicenseTopics({ courseId }: { courseId: string }) {
  const supabase = createClient()
  const [rows, setRows]       = useState<Row[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [topicRes, jurRes, tagRes] = await Promise.all([
        supabase.from('license_requirement_topics').select('*'),
        supabase.from('license_jurisdictions').select('code, name'),
        supabase.from('course_license_topics').select('topic_id').eq('course_id', courseId),
      ])
      const names = new Map((jurRes.data ?? []).map(j => [j.code as string, j.name as string]))
      setRows(((topicRes.data ?? []) as RequirementTopic[])
        .map(t => ({ ...t, state: names.get(t.jurisdiction_code) ?? t.jurisdiction_code }))
        .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name)))
      setSelected(new Set((tagRes.data ?? []).map(t => t.topic_id as string)))
      setLoading(false)
    }
    load()
  }, [courseId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(topicId: string, on: boolean) {
    setBusyId(topicId); setError(null)
    let err: { message: string } | null
    if (on) {
      const companyId = await getCompanyId()
      if (!companyId) { setError('Could not determine your company.'); setBusyId(null); return }
      err = (await supabase.from('course_license_topics').insert({ course_id: courseId, topic_id: topicId, company_id: companyId })).error
    } else {
      err = (await supabase.from('course_license_topics').delete().eq('course_id', courseId).eq('topic_id', topicId)).error
    }
    setBusyId(null)
    if (err) { setError(err.message); return }
    setSelected(prev => { const n = new Set(prev); if (on) n.add(topicId); else n.delete(topicId); return n })
  }

  if (loading || rows.length === 0) return null
  const states = Array.from(new Set(rows.map(r => r.state)))

  return (
    <details className="mt-8 rounded-lg border bg-white shadow-sm group" open={selected.size > 0}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700">
        State licensure topics
        <span className="ml-2 text-xs font-normal text-gray-400">
          {selected.size > 0 ? `${selected.size} selected` : 'Counts toward a state requirement?'}
        </span>
      </summary>
      <div className="border-t px-4 py-4 space-y-4">
        <p className="text-xs text-gray-500">
          When a BCBA completes this course, the topics you tick are marked done on their license in that state.
          This also credits BCBAs who have already completed it.
        </p>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {states.map(state => (
            <div key={state}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{state}</p>
              <ul className="space-y-1">
                {rows.filter(r => r.state === state).map(t => (
                  <li key={t.id}>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={selected.has(t.id)} disabled={busyId === t.id}
                        onChange={e => toggle(t.id, e.target.checked)} className="mt-0.5 accent-[#025CA8]" />
                      <span>
                        {t.name}
                        <span className="text-xs text-gray-400"> · {t.hours != null ? `${Number(t.hours)} hr · ` : ''}{topicFrequencyLabel(t)}</span>
                      </span>
                      {busyId === t.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </details>
  )
}
