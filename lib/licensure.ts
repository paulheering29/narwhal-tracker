// State licensure for BCBAs. Shared by server pages and client components, so
// it must stay free of React / 'use client'.

export type Jurisdiction = {
  code: string
  name: string
  regulation_status: 'licensed' | 'registration' | 'certified' | 'pending'
  cycle_years: number | null
  ce_basis: 'bacb' | 'state_hours' | 'bacb_plus_topics' | 'none' | 'pending'
  ce_hours_required: number | null
  ce_period_years: number | null
  ethics_hours_required: number | null
  ce_met_by_bacb: boolean
  tied_to_bacb: boolean
  needs_verification: boolean
  ce_summary: string | null
  ethics_summary: string | null
  supervision_summary: string | null
  other_requirements: string | null
  renewal_notes: string | null
  sources: string | null
  last_reviewed: string
}

export type RequirementTopic = {
  id: string
  jurisdiction_code: string
  name: string
  hours: number | null
  frequency: 'once' | 'each_renewal' | 'every_n_years'
  every_n_years: number | null
  counts_toward_ce: boolean
  note: string | null
}

export type LicenseStatus = 'active' | 'pending' | 'lapsed' | 'inactive'

export type StaffLicense = {
  id: string
  staff_id: string
  jurisdiction_code: string
  license_number: string | null
  status: LicenseStatus
  issued_date: string | null
  expiration_date: string
  notes: string | null
  ce_exempt_this_cycle: boolean
  ce_hours_override: number | null
  ce_period_end: string | null
  verified_at: string | null
  verification_result: 'verified' | 'expired' | 'not_found' | 'review' | null
  verification_detail: string | null
}

export const LICENSE_COLUMNS =
  'id, staff_id, jurisdiction_code, license_number, status, issued_date, expiration_date, notes, ce_exempt_this_cycle, ce_hours_override, ce_period_end, verified_at, verification_result, verification_detail'

export const JURISDICTION_COLUMNS =
  'code, name, regulation_status, cycle_years, ce_basis, ce_hours_required, ce_period_years, ethics_hours_required, ce_met_by_bacb, tied_to_bacb, needs_verification, ce_summary, ethics_summary, supervision_summary, other_requirements, renewal_notes, sources, last_reviewed'

export const STATUS_LABEL: Record<LicenseStatus, string> = {
  active: 'Active', pending: 'Pending', lapsed: 'Lapsed', inactive: 'Inactive',
}

export const REGULATION_LABEL: Record<Jurisdiction['regulation_status'], string> = {
  licensed: 'Licensure', registration: 'Registration', certified: 'State certification', pending: 'Not yet in effect',
}

/** Whole days from today until the date (negative once it has passed). */
export function daysUntil(date: string, today = new Date()): number {
  const t = new Date(today.toDateString()).getTime()
  return Math.ceil((new Date(date + 'T00:00:00').getTime() - t) / 86400000)
}

export function fmtLicenseDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

/** Pill colours for a number of days left, matching the rest of the app. */
export function expiryPill(days: number): string {
  if (days < 0)   return 'bg-red-100 text-red-700'
  if (days <= 30) return 'bg-rose-100 text-rose-700'
  if (days <= 90) return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

export function daysLabel(days: number): string {
  if (days < 0)   return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
  if (days === 0) return 'Expires today'
  return `${days} day${days === 1 ? '' : 's'} left`
}

/**
 * A license that needs the BACB certification to stay active, but whose BACB
 * cycle ends first, can't be renewed without renewing the BACB too. Returns the
 * BACB end date when that's the case.
 */
export function bacbEndsBeforeLicense(
  license: Pick<StaffLicense, 'expiration_date'>,
  jurisdiction: Pick<Jurisdiction, 'tied_to_bacb'> | undefined,
  bacbEnd: string | null | undefined,
): string | null {
  if (!jurisdiction?.tied_to_bacb || !bacbEnd) return null
  return bacbEnd < license.expiration_date ? bacbEnd : null
}

export function topicFrequencyLabel(t: Pick<RequirementTopic, 'frequency' | 'every_n_years'>) {
  if (t.frequency === 'once') return 'one time'
  if (t.frequency === 'each_renewal') return 'each renewal'
  return `every ${t.every_n_years ?? '?'} years`
}
