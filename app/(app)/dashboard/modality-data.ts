import type { SupabaseClient } from '@supabase/supabase-js'

export type ModalityCounts = { internalLive: number; internalRecorded: number; external: number }
export type ModalityByRange = { last30: ModalityCounts; all: ModalityCounts }

/**
 * Trainings completed (last 30 days and all time), split by how they were delivered,
 * for active staff of each credential code: confirmed internal trainings
 * (live vs. streamed) and outside trainings the team hasn't rejected.
 */
export async function getModalityCounts(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Record<string, ModalityByRange>> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [{ data: records }, { data: outside }] = await Promise.all([
    supabase
      .from('training_records')
      .select('completed_date, staff:staff_id(role, active), courses:course_id(course_type)')
      .eq('confirmed', true),
    supabase
      .from('external_trainings')
      .select('completed_date, staff:staff_id(role, active)')
      .neq('review_status', 'not_approved'),
  ])

  const blank = (): ModalityCounts => ({ internalLive: 0, internalRecorded: 0, external: 0 })
  const result: Record<string, ModalityByRange> = Object.fromEntries(
    codes.map(c => [c, { last30: blank(), all: blank() }]),
  )
  const bump = (code: string, date: string, field: keyof ModalityCounts) => {
    result[code].all[field]++
    if (date >= since) result[code].last30[field]++
  }
  const roleOf = (row: { staff: unknown }) => {
    const s = (Array.isArray(row.staff) ? row.staff[0] : row.staff) as { role: string | null; active: boolean } | null
    return s?.active ? codes.find(c => c.toUpperCase() === String(s.role).toUpperCase()) : undefined
  }

  for (const r of records ?? []) {
    const code = roleOf(r)
    if (!code) continue
    const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
    if (course?.course_type === 'live')          bump(code, r.completed_date as string, 'internalLive')
    else if (course?.course_type === 'streamed') bump(code, r.completed_date as string, 'internalRecorded')
  }
  for (const t of outside ?? []) {
    const code = roleOf(t)
    if (code) bump(code, t.completed_date as string, 'external')
  }
  return result
}
