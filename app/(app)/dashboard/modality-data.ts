import type { SupabaseClient } from '@supabase/supabase-js'

export type ModalityCounts = { internalLive: number; internalRecorded: number; external: number }

/**
 * Trainings completed in the last 30 days, split by how they were delivered,
 * for active staff of each credential code: confirmed internal trainings
 * (live vs. streamed) and outside trainings the team hasn't rejected.
 */
export async function getModalityCounts(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Record<string, ModalityCounts>> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [{ data: records }, { data: outside }] = await Promise.all([
    supabase
      .from('training_records')
      .select('staff:staff_id(role, active), courses:course_id(course_type)')
      .eq('confirmed', true)
      .gte('completed_date', since),
    supabase
      .from('external_trainings')
      .select('staff:staff_id(role, active)')
      .neq('review_status', 'not_approved')
      .gte('completed_date', since),
  ])

  const result: Record<string, ModalityCounts> = Object.fromEntries(
    codes.map(c => [c, { internalLive: 0, internalRecorded: 0, external: 0 }]),
  )
  const roleOf = (row: { staff: unknown }) => {
    const s = (Array.isArray(row.staff) ? row.staff[0] : row.staff) as { role: string | null; active: boolean } | null
    return s?.active ? codes.find(c => c.toUpperCase() === String(s.role).toUpperCase()) : undefined
  }

  for (const r of records ?? []) {
    const code = roleOf(r)
    if (!code) continue
    const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
    if (course?.course_type === 'live')          result[code].internalLive++
    else if (course?.course_type === 'streamed') result[code].internalRecorded++
  }
  for (const t of outside ?? []) {
    const code = roleOf(t)
    if (code) result[code].external++
  }
  return result
}
