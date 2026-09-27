import type { SupabaseClient } from '@supabase/supabase-js'
import type { Credential } from '@/lib/credentials'
import type { PersonalDashboardData } from './personal-dashboard'

function fmtDate(dateStr: string | null | undefined) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${m}/${d}/${y}`
}

// How many units (PDUs/CEUs) someone should have by today to stay on pace
// for `target` by the end of their cycle — same formula used on the admin
// staff table (computePacingTarget in staff/client.tsx), duplicated here
// since that file is a client component.
function computePacingTarget(startDate: string, endDate: string, target: number): number {
  const todayMs = new Date(new Date().toDateString()).getTime()
  const startMs = new Date(startDate + 'T00:00:00').getTime()
  const endMs   = new Date(endDate   + 'T00:00:00').getTime()
  const total   = endMs - startMs
  if (total <= 0) return target
  const elapsed = Math.max(0, Math.min(total, todayMs - startMs))
  return Math.round((elapsed / total) * target * 2) / 2
}

/**
 * Everything the personal dashboard shows for one person: their cycle,
 * units earned against their credential's requirement, assigned courses,
 * completed and upcoming trainings. Used by /dashboard (learner accounts)
 * and /my-progress (staff accounts that also hold a credential).
 */
export async function getPersonalDashboardData(
  supabase: SupabaseClient,
  staffId: string,
  credential: Credential | null,
): Promise<PersonalDashboardData> {
  const today = new Date().toISOString().split('T')[0]

  const [cyclesRes, recordsRes, assignmentsRes] = await Promise.all([
    supabase
      .from('certification_cycles')
      .select('certification_type, start_date, end_date')
      .eq('staff_id', staffId)
      .order('end_date', { ascending: false }),
    supabase
      .from('training_records')
      .select('id, completed_date, confirmed, courses:course_id(id, name, units, course_type, date, start_time, end_time)')
      .eq('staff_id', staffId)
      .order('completed_date', { ascending: false }),
    supabase
      .from('course_assignments')
      .select('course_id, courses:course_id(id, name, units, course_type)')
      .eq('staff_id', staffId),
  ])

  const cycles = (cyclesRes.data ?? []).filter(c => !credential || c.certification_type.toUpperCase() === credential.code.toUpperCase())
  const activeCycle = cycles.find(c => c.start_date <= today && c.end_date >= today) ?? cycles[0] ?? null
  const daysUntilExpiry = activeCycle
    ? Math.ceil((new Date(activeCycle.end_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : null

  const records = (recordsRes.data ?? []) as unknown as {
    id: string; completed_date: string; confirmed: boolean
    courses: { id: string; name: string; units: number | null; course_type: string; date: string | null; start_time: string | null; end_time: string | null } | null
  }[]

  let unitsDone = 0
  let unitsScheduled = 0
  if (activeCycle) {
    for (const r of records) {
      if (r.completed_date < activeCycle.start_date || r.completed_date > activeCycle.end_date) continue
      const units = r.courses?.units ?? 0
      if (r.confirmed) unitsDone += units
      else             unitsScheduled += units
    }
  }

  const confirmedRecordCourseIds = new Set(records.filter(r => r.confirmed && r.courses).map(r => r.courses!.id))

  const completed = records
    .filter(r => r.confirmed && r.courses)
    .slice(0, 25)
    .map(r => ({
      id:       r.id,
      label:    r.courses!.name,
      sublabel: fmtDate(r.completed_date),
      href:     r.courses!.course_type === 'streamed' ? `/my-courses/${r.courses!.id}` : `/trainings/${r.courses!.id}`,
    }))

  const upcomingRaw = records
    .filter(r => r.courses?.course_type === 'live' && r.courses.date && r.courses.date >= today)
    .sort((a, b) => (a.courses!.date! < b.courses!.date! ? -1 : 1))
  const upcoming = upcomingRaw.slice(0, 25).map(r => ({
    id:       r.id,
    label:    r.courses!.name,
    sublabel: fmtDate(r.courses!.date),
    href:     `/trainings/${r.courses!.id}`,
  }))

  const assignments = (assignmentsRes.data ?? []) as unknown as {
    course_id: string; courses: { id: string; name: string; units: number | null; course_type: string } | null
  }[]
  const streamedAssignments = assignments.filter(a => a.courses?.course_type === 'streamed')
  const streamedCourseIds = streamedAssignments.map(a => a.course_id)

  const totalByCourse = new Map<string, number>()
  const completedSectionsByCourse = new Map<string, number>()
  if (streamedCourseIds.length > 0) {
    const [videosRes, progressRes] = await Promise.all([
      supabase.from('course_videos').select('id, course_id').in('course_id', streamedCourseIds),
      supabase.from('course_watch_progress').select('course_id, completed').eq('staff_id', staffId).in('course_id', streamedCourseIds),
    ])
    for (const v of videosRes.data ?? []) {
      totalByCourse.set(v.course_id, (totalByCourse.get(v.course_id) ?? 0) + 1)
    }
    for (const p of progressRes.data ?? []) {
      if (p.completed) completedSectionsByCourse.set(p.course_id, (completedSectionsByCourse.get(p.course_id) ?? 0) + 1)
    }
  }

  const assignedCourses = streamedAssignments
    .filter(a => a.courses)
    .map(a => {
      const totalSections     = totalByCourse.get(a.course_id) ?? 0
      const completedSections = completedSectionsByCourse.get(a.course_id) ?? 0
      const status: 'not_started' | 'in_progress' | 'complete' =
        confirmedRecordCourseIds.has(a.course_id) ? 'complete' : completedSections > 0 ? 'in_progress' : 'not_started'
      return {
        id: a.course_id, name: a.courses!.name, href: `/my-courses/${a.course_id}`,
        completedSections, totalSections, status,
      }
    })
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'complete' ? 1 : b.status === 'complete' ? -1 : 0))

  const unitsTarget  = credential?.units_required ?? 0
  const pacingTarget = activeCycle && unitsTarget > 0 ? computePacingTarget(activeCycle.start_date, activeCycle.end_date, unitsTarget) : 0

  return {
    certType:         activeCycle?.certification_type ?? null,
    cycleEndDate:      activeCycle?.end_date ?? null,
    daysUntilExpiry,
    unitLabel:         credential?.unit_label ?? null,
    unitsDone,
    unitsScheduled,
    unitsTarget,
    pacingTarget,
    assignedCourses,
    completed,
    completedCount:    records.filter(r => r.confirmed).length,
    upcoming,
    upcomingCount:     upcomingRaw.length,
  }
}
