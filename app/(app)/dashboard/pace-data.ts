import type { SupabaseClient } from '@supabase/supabase-js'

export type PaceSummary = { onPace: number; behind: number }

// Same formula as the staff table (computePacingTarget in staff/client.tsx).
function pacingTarget(startDate: string, endDate: string, target: number): number {
  const todayMs = new Date(new Date().toDateString()).getTime()
  const startMs = new Date(startDate + 'T00:00:00').getTime()
  const endMs   = new Date(endDate   + 'T00:00:00').getTime()
  const total   = endMs - startMs
  if (total <= 0) return target
  const elapsed = Math.max(0, Math.min(total, todayMs - startMs))
  return Math.round((elapsed / total) * target * 2) / 2
}

/**
 * For each credential code, how many active staff are on or ahead of pace
 * (confirmed units >= the straight-line target for today) vs behind.
 * Staff without a current cycle have no pace and are left out.
 */
export async function getPaceSummaries(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Record<string, PaceSummary>> {
  const today = new Date().toISOString().split('T')[0]

  const [{ data: staff }, { data: types }, { data: cycles }] = await Promise.all([
    supabase.from('staff').select('id, role').eq('active', true).in('role', codes),
    supabase.from('credential_types').select('code, units_required').in('code', codes),
    supabase.from('certification_cycles').select('staff_id, certification_type, start_date, end_date')
      .lte('start_date', today).gte('end_date', today),
  ])

  const staffIds = (staff ?? []).map(s => s.id as string)
  const [{ data: recs }, { data: outside }] = staffIds.length === 0 ? [{ data: [] }, { data: [] }] : await Promise.all([
    supabase.from('training_records')
      .select('staff_id, completed_date, courses(units, eligible_credentials)')
      .eq('confirmed', true).in('staff_id', staffIds),
    supabase.from('external_trainings')
      .select('staff_id, completed_date, units')
      .neq('review_status', 'not_approved').in('staff_id', staffIds),
  ])

  const targetByCode = new Map((types ?? []).map(t => [String(t.code).toUpperCase(), Number(t.units_required)]))
  const result: Record<string, PaceSummary> = Object.fromEntries(codes.map(c => [c, { onPace: 0, behind: 0 }]))

  for (const s of staff ?? []) {
    const code  = String(s.role).toUpperCase()
    const cycle = (cycles ?? []).find(c => c.staff_id === s.id && String(c.certification_type).toUpperCase() === code)
    const target = targetByCode.get(code)
    if (!cycle || !target) continue

    let done = 0
    for (const r of recs ?? []) {
      if (r.staff_id !== s.id || r.completed_date < cycle.start_date || r.completed_date > cycle.end_date) continue
      const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
      if (!((course?.eligible_credentials as string[] | null) ?? ['RBT']).includes(code)) continue
      done += Number(course?.units ?? 0)
    }
    for (const t of outside ?? []) {
      if (t.staff_id === s.id && t.completed_date >= cycle.start_date && t.completed_date <= cycle.end_date) done += Number(t.units)
    }

    const key = codes.find(c => c.toUpperCase() === code)!
    if (done >= pacingTarget(cycle.start_date, cycle.end_date, target)) result[key].onPace++
    else result[key].behind++
  }
  return result
}
