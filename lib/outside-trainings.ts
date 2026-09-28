// Shared by server pages (dashboard totals) and the client panel, so it must
// stay free of React / 'use client'.

export type OutsideTraining = {
  id: string
  name: string
  provider: string | null
  completed_date: string
  units: number
  ethics_units: number
  supervision_units: number
  certificate_path: string | null
  notes: string | null
  review_status: 'pending' | 'approved' | 'not_approved'
}

export const OUTSIDE_TRAINING_COLUMNS =
  'id, name, provider, completed_date, units, ethics_units, supervision_units, certificate_path, notes, review_status'

/** Supabase returns numerics as strings; normalise a row for the UI. */
export function toOutsideTraining(row: Record<string, unknown>): OutsideTraining {
  return {
    ...(row as unknown as OutsideTraining),
    units:             Number(row.units),
    ethics_units:      Number(row.ethics_units),
    supervision_units: Number(row.supervision_units),
  }
}

/** Only entries the team marked not approved stop counting. */
export function countsTowardTotals(t: { review_status: string }) {
  return t.review_status !== 'not_approved'
}
