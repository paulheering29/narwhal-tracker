import type { SupabaseClient } from '@supabase/supabase-js'
import type { Jurisdiction, RequirementTopic, StaffLicense } from '@/lib/licensure'

// Pure calculations plus one loader for state CE hours and topic requirements.
// No React, so server and client code can both use it.

export type UnitEvent = { date: string; units: number; ethics: number; supervision: number }

export type TopicCompletion = {
  id: string
  license_id: string
  topic_id: string
  completed_date: string
  certificate_path: string | null
  notes: string | null
}

export const COMPLETION_COLUMNS = 'id, license_id, topic_id, completed_date, certificate_path, notes'

const addYears = (iso: string, years: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().split('T')[0]
}

/**
 * Units a BCBA has earned, by date: confirmed trainings that count for BCBA,
 * plus outside trainings unless the team marked them not approved. One CEU is
 * one state hour.
 */
export async function loadUnitEvents(
  supabase: SupabaseClient,
  staffIds: string[],
): Promise<Record<string, UnitEvent[]>> {
  const out: Record<string, UnitEvent[]> = {}
  if (staffIds.length === 0) return out

  const [recordsRes, externalRes] = await Promise.all([
    supabase
      .from('training_records')
      .select('staff_id, completed_date, courses:course_id(units, ethics_units, supervision_units, eligible_credentials)')
      .in('staff_id', staffIds)
      .eq('confirmed', true),
    supabase
      .from('external_trainings')
      .select('staff_id, completed_date, units, ethics_units, supervision_units, review_status')
      .in('staff_id', staffIds)
      .neq('review_status', 'not_approved'),
  ])

  for (const r of recordsRes.data ?? []) {
    const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
    if (!course || !((course.eligible_credentials as string[] | null) ?? ['RBT']).includes('BCBA')) continue
    ;(out[r.staff_id as string] ??= []).push({
      date: r.completed_date as string, units: Number(course.units ?? 0), ethics: Number(course.ethics_units ?? 0),
      supervision: Number(course.supervision_units ?? 0),
    })
  }
  for (const t of externalRes.data ?? []) {
    ;(out[t.staff_id as string] ??= []).push({
      date: t.completed_date as string, units: Number(t.units), ethics: Number(t.ethics_units),
      supervision: Number(t.supervision_units),
    })
  }
  return out
}

export type CeProgress = {
  required: number
  done: number
  ethicsRequired: number
  ethicsDone: number
  windowStart: string
  windowEnd: string
  exempt: boolean
  metByBacb: boolean      // the state treats its hours as met while the BACB certification is active
  complete: boolean
}

/**
 * Progress toward a state's own CE hours for the current period. Null when the
 * state has no hours of its own (most states just require an active BACB).
 */
export function computeCeProgress(
  license: StaffLicense & { ce_exempt_this_cycle?: boolean; ce_hours_override?: number | null; ce_period_end?: string | null },
  jurisdiction: Jurisdiction | undefined,
  events: UnitEvent[],
  bacbActive: boolean,
): CeProgress | null {
  if (!jurisdiction || jurisdiction.ce_basis !== 'state_hours' || jurisdiction.ce_hours_required == null) return null

  const windowEnd   = license.ce_period_end ?? license.expiration_date
  const windowStart = addYears(windowEnd, -(jurisdiction.ce_period_years ?? jurisdiction.cycle_years ?? 2))
  let done = 0, ethicsDone = 0
  for (const e of events) {
    if (e.date > windowStart && e.date <= windowEnd) { done += e.units; ethicsDone += e.ethics }
  }
  // Numeric columns can arrive as strings, so make them numbers here once.
  const required       = Number(license.ce_hours_override ?? jurisdiction.ce_hours_required)
  const ethicsRequired = Number(jurisdiction.ethics_hours_required ?? 0)
  const exempt         = !!license.ce_exempt_this_cycle
  const metByBacb      = jurisdiction.ce_met_by_bacb && bacbActive
  return {
    required, done, ethicsRequired, ethicsDone, windowStart, windowEnd, exempt, metByBacb,
    complete: exempt || metByBacb || (done >= required && ethicsDone >= ethicsRequired),
  }
}

export type TopicStatus = { topic: RequirementTopic; done: boolean; last: TopicCompletion | null }

/** Is each required topic current, given the completions recorded for this license? */
export function computeTopicStatuses(
  license: Pick<StaffLicense, 'id' | 'expiration_date'>,
  jurisdiction: Jurisdiction | undefined,
  topics: RequirementTopic[],
  completions: TopicCompletion[],
  today = new Date().toISOString().split('T')[0],
): TopicStatus[] {
  const cycleStart = addYears(license.expiration_date, -(jurisdiction?.cycle_years ?? 2))
  return topics.map(topic => {
    const mine = completions
      .filter(c => c.license_id === license.id && c.topic_id === topic.id)
      .sort((a, b) => b.completed_date.localeCompare(a.completed_date))
    const last = mine[0] ?? null
    let done = false
    if (last) {
      if (topic.frequency === 'once')              done = true
      else if (topic.frequency === 'each_renewal') done = last.completed_date > cycleStart
      else                                         done = last.completed_date > addYears(today, -(topic.every_n_years ?? 1))
    }
    return { topic, done, last }
  })
}
