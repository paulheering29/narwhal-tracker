'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getStaffId } from '@/lib/get-staff-id'
import { Loader2, PlayCircle, CheckCircle2, Circle, GraduationCap } from 'lucide-react'

type AssignedCourse = {
  id: string
  name: string
  description: string | null
  units: number | null
  totalParts: number
  completedParts: number
}

export default function MyCoursesPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [courses, setCourses] = useState<AssignedCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const staffId = await getStaffId()
      if (!staffId) { setError('Could not determine your account. Please sign out and back in.'); setLoading(false); return }

      const { data: assignments, error: assignErr } = await supabase
        .from('course_assignments')
        .select('course_id, courses:course_id(id, name, description, units)')
        .eq('staff_id', staffId)
      if (assignErr) { setError(assignErr.message); setLoading(false); return }

      const courseIds = (assignments ?? []).map(a => a.course_id)
      if (courseIds.length === 0) { setCourses([]); setLoading(false); return }

      const [videosRes, progressRes] = await Promise.all([
        supabase.from('course_videos').select('id, course_id').in('course_id', courseIds),
        supabase.from('course_watch_progress').select('course_id, completed').eq('staff_id', staffId).in('course_id', courseIds),
      ])

      const totalByCourse = new Map<string, number>()
      for (const v of videosRes.data ?? []) {
        totalByCourse.set(v.course_id, (totalByCourse.get(v.course_id) ?? 0) + 1)
      }
      const completedByCourse = new Map<string, number>()
      for (const p of progressRes.data ?? []) {
        if (p.completed) completedByCourse.set(p.course_id, (completedByCourse.get(p.course_id) ?? 0) + 1)
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
        }
      })
      setCourses(result)
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
      ) : courses.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          No courses assigned to you yet.
        </div>
      ) : (
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
      )}
    </div>
  )
}
