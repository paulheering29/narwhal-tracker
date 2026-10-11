'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getStaffId } from '@/lib/get-staff-id'
import { Loader2, PlayCircle, CheckCircle2, Circle, GraduationCap, Lock, Route } from 'lucide-react'

type AssignedCourse = {
  id: string
  name: string
  description: string | null
  units: number | null
  totalParts: number
  completedParts: number
  paths: string[]          // names of the learning paths this course is part of
}

type PathCourse = {
  id: string
  name: string
  status: 'done' | 'in_progress' | 'not_started'
  lockedBy: string | null  // name of the earlier course that must be finished first
}

type PathCard = {
  id: string
  name: string
  sequential: boolean
  completedAt: string | null
  courses: PathCourse[]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MyCoursesPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [courses, setCourses] = useState<AssignedCourse[]>([])
  const [paths, setPaths]     = useState<PathCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const staffId = await getStaffId()
      if (!staffId) { setError('Could not determine your account. Please sign out and back in.'); setLoading(false); return }

      const [assignmentsRes, pathAssignmentsRes] = await Promise.all([
        supabase
          .from('course_assignments')
          .select('course_id, courses:course_id(id, name, description, units)')
          .eq('staff_id', staffId),
        supabase
          .from('learning_path_assignments')
          .select('path_id, completed_at, learning_paths(name, sequential)')
          .eq('staff_id', staffId),
      ])
      if (assignmentsRes.error) { setError(assignmentsRes.error.message); setLoading(false); return }
      const assignments = assignmentsRes.data

      const pathIds = (pathAssignmentsRes.data ?? []).map(a => a.path_id)
      const { data: pathCourseRows } = pathIds.length
        ? await supabase
            .from('learning_path_courses')
            .select('path_id, course_id, order_index, courses(id, name)')
            .in('path_id', pathIds)
            .order('order_index')
        : { data: [] }

      const courseIds = Array.from(new Set([
        ...(assignments ?? []).map(a => a.course_id as string),
        ...(pathCourseRows ?? []).map(c => c.course_id as string),
      ]))
      if (courseIds.length === 0) { setCourses([]); setPaths([]); setLoading(false); return }

      const [videosRes, progressRes, confirmedRes] = await Promise.all([
        supabase.from('course_videos').select('id, course_id').in('course_id', courseIds),
        supabase.from('course_watch_progress').select('course_id, completed').eq('staff_id', staffId).in('course_id', courseIds),
        // A passed quiz writes a confirmed record: that's what "complete" means.
        supabase.from('training_records').select('course_id').eq('staff_id', staffId).eq('confirmed', true).in('course_id', courseIds),
      ])

      const totalByCourse = new Map<string, number>()
      for (const v of videosRes.data ?? []) {
        totalByCourse.set(v.course_id, (totalByCourse.get(v.course_id) ?? 0) + 1)
      }
      const completedByCourse = new Map<string, number>()
      const startedCourses = new Set<string>()
      for (const p of progressRes.data ?? []) {
        startedCourses.add(p.course_id)
        if (p.completed) completedByCourse.set(p.course_id, (completedByCourse.get(p.course_id) ?? 0) + 1)
      }
      const doneCourses = new Set((confirmedRes.data ?? []).map(r => r.course_id as string))

      // Path cards, with sequential locks worked out from what's finished.
      const cards: PathCard[] = (pathAssignmentsRes.data ?? []).map(a => {
        const meta = Array.isArray(a.learning_paths) ? a.learning_paths[0] : a.learning_paths
        const ordered = (pathCourseRows ?? []).filter(c => c.path_id === a.path_id)
        const items: PathCourse[] = ordered.map((c, i) => {
          const course = Array.isArray(c.courses) ? c.courses[0] : c.courses
          const status: PathCourse['status'] =
            doneCourses.has(c.course_id) ? 'done' : startedCourses.has(c.course_id) ? 'in_progress' : 'not_started'
          const firstUnfinishedBefore = meta?.sequential && status !== 'done'
            ? ordered.slice(0, i).find(p => !doneCourses.has(p.course_id))
            : undefined
          const blocker = firstUnfinishedBefore
            ? (Array.isArray(firstUnfinishedBefore.courses) ? firstUnfinishedBefore.courses[0] : firstUnfinishedBefore.courses)
            : null
          return {
            id: c.course_id as string,
            name: course?.name ?? 'Untitled course',
            status,
            lockedBy: firstUnfinishedBefore ? (blocker?.name ?? 'the previous course') : null,
          }
        })
        return { id: a.path_id, name: meta?.name ?? 'Learning path', sequential: !!meta?.sequential, completedAt: a.completed_at, courses: items }
      })

      const pathsByCourse = new Map<string, string[]>()
      for (const card of cards) {
        for (const c of card.courses) pathsByCourse.set(c.id, [...(pathsByCourse.get(c.id) ?? []), card.name])
      }

      const result: AssignedCourse[] = (assignments ?? []).map(a => {
        const c = Array.isArray(a.courses) ? a.courses[0] : a.courses
        return {
          id:             c?.id ?? a.course_id,
          name:           c?.name ?? 'Untitled course',
          description:    c?.description ?? null,
          units:          c?.units ?? null,
          totalParts:     totalByCourse.get(a.course_id) ?? 0,
          completedParts: completedByCourse.get(a.course_id) ?? 0,
          paths:          pathsByCourse.get(a.course_id) ?? [],
        }
      })
      setCourses(result)
      setPaths(cards)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">My Courses</h1>
        <p className="mt-1 text-sm text-gray-500">Self-paced courses assigned to you</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
      ) : courses.length === 0 && paths.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          No courses assigned to you yet.
        </div>
      ) : (
        <>
          {paths.length > 0 && (
            <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {paths.map(p => {
                const done = p.courses.filter(c => c.status === 'done').length
                const complete = !!p.completedAt
                return (
                  <div key={p.id} className="rounded-xl border bg-white shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-2 text-[#025CA8]">
                      <Route className="h-5 w-5" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Learning path</span>
                      {complete && (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 normal-case tracking-normal">
                          <CheckCircle2 className="h-3 w-3" /> Complete · {fmtDate(p.completedAt!)}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900">{p.name}</p>
                    <p className="mt-0.5 mb-2 text-xs text-gray-500">
                      {done} of {p.courses.length} complete{p.sequential ? ' · finish in order' : ''}
                    </p>
                    <div className="mb-4 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-[#025CA8]'}`}
                        style={{ width: `${p.courses.length ? Math.max(2, (done / p.courses.length) * 100) : 0}%` }} />
                    </div>
                    <ol className="space-y-1">
                      {p.courses.map((c, i) => {
                        const locked = c.lockedBy !== null
                        return (
                          <li key={c.id}>
                            <button
                              disabled={locked}
                              onClick={() => router.push(`/my-courses/${c.id}`)}
                              className={`w-full flex items-start gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                                locked ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <span className="mt-0.5 shrink-0">
                                {c.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  : locked ? <Lock className="h-4 w-4" />
                                  : c.status === 'in_progress' ? <PlayCircle className="h-4 w-4 text-amber-500" />
                                  : <Circle className="h-4 w-4 text-gray-400" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{i + 1}. {c.name}</span>
                                {locked && <span className="block text-xs">Complete {c.lockedBy} first</span>}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                )
              })}
            </div>
          )}

          {courses.length > 0 && (
            <>
              {paths.length > 0 && <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">All courses</h2>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map(c => {
                  const started   = c.completedParts > 0
                  const allDone   = c.totalParts > 0 && c.completedParts >= c.totalParts
                  return (
                    <button key={c.id} onClick={() => router.push(`/my-courses/${c.id}`)}
                      className="text-left rounded-xl border bg-white shadow-sm p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 mb-2 text-[#025CA8]">
                        <GraduationCap className="h-5 w-5" />
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          {c.units != null ? `${c.units} PDU${c.units !== 1 ? 's' : ''}` : 'Streamed course'}
                        </span>
                      </div>
                      <p className="font-semibold text-gray-900 mb-1">{c.name}</p>
                      {c.paths.length > 0 && (
                        <p className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400">
                          <Route className="h-3 w-3" /> Part of {c.paths.join(', ')}
                        </p>
                      )}
                      {c.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{c.description}</p>}
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {allDone ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> All sections watched
                          </span>
                        ) : started ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                            <PlayCircle className="h-3.5 w-3.5" /> In progress · {c.completedParts}/{c.totalParts} sections
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <Circle className="h-3.5 w-3.5" /> Not started · {c.totalParts} section{c.totalParts !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
