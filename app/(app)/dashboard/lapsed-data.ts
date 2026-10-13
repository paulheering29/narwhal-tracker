import type { SupabaseClient } from '@supabase/supabase-js'

export type LapsedItem = { id: string; staffId: string; name: string; what: string; expired: string }

type Staff = { first_name: string; last_name: string; active: boolean }
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

/**
 * Active staff whose certification or state license has run out with nothing
 * covering today: no certification cycle of that type spans today, and no
 * active license in that state is still unexpired. That also catches a gap
 * (the old one ended and the new one starts later), not just "never renewed".
 */
export async function getLapsed(supabase: SupabaseClient): Promise<LapsedItem[]> {
  const today = new Date().toISOString().split('T')[0]

  const [{ data: cycles }, { data: licenses }] = await Promise.all([
    supabase.from('certification_cycles')
      .select('id, staff_id, certification_type, start_date, end_date, staff:staff_id(first_name, last_name, active)'),
    supabase.from('staff_licenses')
      .select('id, staff_id, jurisdiction_code, expiration_date, status, staff:staff_id(first_name, last_name, active), license_jurisdictions(name)')
      .eq('status', 'active'),
  ])

  const items: LapsedItem[] = []

  const byCert = new Map<string, NonNullable<typeof cycles>>()
  for (const c of cycles ?? []) {
    if (!one(c.staff as Staff | Staff[] | null)?.active) continue
    const key = `${c.staff_id}|${c.certification_type}`
    byCert.set(key, [...(byCert.get(key) ?? []), c])
  }
  for (const group of Array.from(byCert.values())) {
    if (group.some(c => c.start_date <= today && c.end_date >= today)) continue
    const lastEnded = group.filter(c => c.end_date < today).sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
    if (!lastEnded) continue // only a future cycle so far: nothing has expired yet
    const s = one(lastEnded.staff as Staff | Staff[] | null)!
    items.push({
      id: `cert-${lastEnded.id}`, staffId: lastEnded.staff_id as string,
      name: `${s.first_name} ${s.last_name}`, what: `${lastEnded.certification_type} certification`, expired: lastEnded.end_date as string,
    })
  }

  const byLicense = new Map<string, NonNullable<typeof licenses>>()
  for (const l of licenses ?? []) {
    if (!one(l.staff as Staff | Staff[] | null)?.active) continue
    const key = `${l.staff_id}|${l.jurisdiction_code}`
    byLicense.set(key, [...(byLicense.get(key) ?? []), l])
  }
  for (const group of Array.from(byLicense.values())) {
    if (group.some(l => l.expiration_date >= today)) continue
    const latest = group.sort((a, b) => b.expiration_date.localeCompare(a.expiration_date))[0]
    const s = one(latest.staff as Staff | Staff[] | null)!
    const state = one(latest.license_jurisdictions as { name: string } | { name: string }[] | null)
    items.push({
      id: `license-${latest.id}`, staffId: latest.staff_id as string,
      name: `${s.first_name} ${s.last_name}`, what: `${state?.name ?? latest.jurisdiction_code} license`, expired: latest.expiration_date as string,
    })
  }

  return items.sort((a, b) => a.expired.localeCompare(b.expired))
}
