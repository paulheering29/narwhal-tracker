import type { SupabaseClient } from '@supabase/supabase-js'
import { massachusetts } from './massachusetts'
import { verifyLicense } from './verify'
import type { StateLicense, StateSource } from './types'

// Add a state here once its reader exists. Everything else is state-agnostic.
const SOURCES: StateSource[] = [massachusetts]

const CHUNK = 500

/**
 * Download each state's list into state_license_records. A state that fails keeps
 * its previous list (and says why in state_license_sync) so one site being down
 * doesn't wipe out last night's good data.
 */
async function syncStates(db: SupabaseClient) {
  const out: Record<string, string> = {}
  for (const source of SOURCES) {
    const attempt = new Date().toISOString()
    try {
      const { licenses, sourceDate } = await source.fetch()
      if (licenses.length === 0) throw new Error('The state list came back empty, so it was not used.')

      // A license can appear twice under the same number+type; keep the last.
      const unique = new Map<string, StateLicense>()
      for (const l of licenses) unique.set(`${l.number}|${l.type}`, l)

      const rows = Array.from(unique.values()).map(l => ({
        jurisdiction_code: source.code, license_number: l.number, license_type: l.type, status: l.status,
        first_name: l.firstName, middle_name: l.middleName, last_name: l.lastName,
        city: l.city || null, state: l.state || null, expires: l.expires, refreshed_at: attempt,
      }))
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await db.from('state_license_records').upsert(rows.slice(i, i + CHUNK))
        if (error) throw new Error(error.message)
      }
      // Anything not in tonight's list has been removed by the state.
      const { error: delError } = await db.from('state_license_records')
        .delete().eq('jurisdiction_code', source.code).lt('refreshed_at', attempt)
      if (delError) throw new Error(delError.message)

      await db.from('state_license_sync').upsert({
        jurisdiction_code: source.code, last_synced_at: attempt, last_attempt_at: attempt,
        row_count: rows.length, source_date: sourceDate, error: null,
      })
      out[source.code] = `${rows.length} licenses`
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await db.from('state_license_sync').upsert({ jurisdiction_code: source.code, last_attempt_at: attempt, error: message })
      out[source.code] = `failed: ${message}`
    }
  }
  return out
}

type Row = {
  id: string; jurisdiction_code: string; license_number: string | null; expiration_date: string | null
  staff: { first_name: string; last_name: string; display_first_name: string | null } | null
}

/** Check every staff license for the states we have a fresh list for. */
async function verifyAll(db: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10)
  const { data: syncs } = await db.from('state_license_sync').select('jurisdiction_code, last_synced_at')
  const ready = (syncs ?? []).filter(s => s.last_synced_at).map(s => s.jurisdiction_code as string)

  let checked = 0
  for (const code of ready) {
    const records: StateLicense[] = []
    // PostgREST returns at most 1000 rows a request.
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from('state_license_records').select('*')
        .eq('jurisdiction_code', code).range(from, from + 999)
      if (!data?.length) break
      records.push(...data.map(r => ({
        jurisdiction: code, number: r.license_number, type: r.license_type, status: r.status,
        firstName: r.first_name, middleName: r.middle_name, lastName: r.last_name,
        city: r.city ?? '', state: r.state ?? '', expires: r.expires,
      })))
      if (data.length < 1000) break
    }

    const { data: licenses } = await db.from('staff_licenses')
      .select('id, jurisdiction_code, license_number, expiration_date, staff:staff_id(first_name, last_name, display_first_name)')
      .eq('jurisdiction_code', code)

    for (const row of (licenses ?? []) as unknown as Row[]) {
      if (!row.staff) continue
      const v = verifyLicense(
        { firstName: row.staff.first_name, lastName: row.staff.last_name, chosenName: row.staff.display_first_name },
        row.license_number, row.expiration_date, records, today,
      )
      await db.from('staff_licenses').update({
        verified_at: new Date().toISOString(), verification_result: v.result, verification_detail: v.detail,
        state_status: v.stateStatus, state_expiration: v.stateExpiration,
      }).eq('id', row.id)
      checked++
    }
  }
  return { checked, states: ready }
}

export async function runLicenseVerification(db: SupabaseClient) {
  const synced = await syncStates(db)
  const verified = await verifyAll(db)
  return { synced, verified }
}
