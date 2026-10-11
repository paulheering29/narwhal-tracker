import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { EMAIL_FROM } from '@/lib/email'
import { esc, shell } from '@/lib/renewal-reminders'
import { ACCESS_COLUMNS, hasAccess, type AccessRow } from '@/lib/pricing'
import { SOURCES } from './sources'
import { verifyLicense, type VerificationResult } from './verify'
import type { StateLicense } from './types'

const NOTES = new Map(SOURCES.map(s => [s.code, s.notFoundNote ?? '']))

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

      // A license can appear twice under the same number+type (New Jersey: Expired, and
      // Reinstatement Pending). Keep the pending one -- it is the one that says "look at this".
      const unique = new Map<string, StateLicense>()
      for (const l of licenses) {
        const key = `${l.number}|${l.type}`
        const have = unique.get(key)
        if (!have || /pending/i.test(l.status) || !/pending/i.test(have.status)) unique.set(key, l)
      }

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

      const { error: syncError } = await db.from('state_license_sync').upsert({
        jurisdiction_code: source.code, last_synced_at: attempt, last_attempt_at: attempt,
        row_count: rows.length, source_date: sourceDate, error: null,
      })
      if (syncError) throw new Error(syncError.message)
      out[source.code] = `${rows.length} licenses`
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const { error: recordError } = await db.from('state_license_sync')
        .upsert({ jurisdiction_code: source.code, last_attempt_at: attempt, error: message })
      out[source.code] = `failed: ${message}${recordError ? ` (and could not be recorded: ${recordError.message})` : ''}`
    }
  }
  return out
}

type Row = {
  id: string; company_id: string; jurisdiction_code: string; license_number: string | null; expiration_date: string | null
  staff: { first_name: string; last_name: string; display_first_name: string | null } | null
}

/** One license's result, kept for the nightly email. */
type Outcome = { companyId: string; name: string; state: string; number: string | null; result: VerificationResult; detail: string }

/**
 * Check staff licenses, but only the ones an organization pays for: a company is
 * checked for a state when it has added that state (company_license_states) and
 * still has access (trial, subscription, or comped).
 */
async function verifyAll(db: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10)
  const { data: syncs } = await db.from('state_license_sync').select('jurisdiction_code, last_synced_at')
  const synced = new Set((syncs ?? []).filter(s => s.last_synced_at).map(s => s.jurisdiction_code as string))

  const [{ data: companies }, { data: chosen }] = await Promise.all([
    db.from('companies').select(`id, ${ACCESS_COLUMNS}`),
    db.from('company_license_states').select('company_id, jurisdiction_code'),
  ])
  const active = new Set((companies ?? []).filter(c => hasAccess(c as AccessRow)).map(c => c.id as string))
  const companiesByState = new Map<string, string[]>()
  for (const c of chosen ?? []) {
    if (!active.has(c.company_id) || !synced.has(c.jurisdiction_code)) continue
    companiesByState.set(c.jurisdiction_code, [...(companiesByState.get(c.jurisdiction_code) ?? []), c.company_id])
  }
  const ready = Array.from(companiesByState.keys())

  let checked = 0
  const outcomes: Outcome[] = []
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
      .select('id, company_id, jurisdiction_code, license_number, expiration_date, staff:staff_id(first_name, last_name, display_first_name)')
      .eq('jurisdiction_code', code).in('company_id', companiesByState.get(code) ?? [])

    for (const row of (licenses ?? []) as unknown as Row[]) {
      if (!row.staff) continue
      const v = verifyLicense(
        { firstName: row.staff.first_name, lastName: row.staff.last_name, chosenName: row.staff.display_first_name },
        row.license_number, row.expiration_date, records, today, NOTES.get(code),
      )
      await db.from('staff_licenses').update({
        verified_at: new Date().toISOString(), verification_result: v.result, verification_detail: v.detail,
        state_status: v.stateStatus, state_expiration: v.stateExpiration,
      }).eq('id', row.id)
      checked++
      outcomes.push({
        companyId: row.company_id, name: `${row.staff.display_first_name?.trim() || row.staff.first_name} ${row.staff.last_name}`,
        state: code, number: row.license_number, result: v.result, detail: v.detail,
      })
    }
  }
  return { checked, states: ready, outcomes }
}

const RESULT_LABEL: Record<VerificationResult, string> = {
  verified: 'Verified', review: 'Needs review', expired: 'Expired on the state list', not_found: 'Not found on the state list',
}

/**
 * Email each company that asked for it the night's results: a count, then every
 * license that was not a clean match. Goes only to staff the Account Owner ticked.
 */
async function sendNightlyEmails(db: SupabaseClient, outcomes: Outcome[], appUrl: string) {
  const companyIds = Array.from(new Set(outcomes.map(o => o.companyId)))
  if (companyIds.length === 0) return { emails: 0, failed: 0 }

  const { data: companies } = await db.from('companies').select('id, name')
    .in('id', companyIds).eq('license_check_email_enabled', true)
  if (!companies?.length) return { emails: 0, failed: 0 }

  const resend = new Resend(process.env.RESEND_API_KEY)
  let emails = 0, failed = 0
  for (const company of companies) {
    const mine = outcomes.filter(o => o.companyId === company.id)
    const bad = mine.filter(o => o.result !== 'verified')
    const { data: people } = await db.from('staff').select('email')
      .eq('company_id', company.id).eq('license_check_email', true).eq('active', true).not('email', 'is', null)
    const to = Array.from(new Set((people ?? []).map(p => p.email as string)))
    if (to.length === 0) continue

    const subject = bad.length === 0
      ? `License check: all ${mine.length} verified`
      : `License check: ${bad.length} of ${mine.length} need attention`
    const rows = bad.map(o => `<li style="margin: 0 0 12px;"><strong>${esc(o.name)}</strong> · ${esc(o.state)}${o.number ? ` #${esc(o.number)}` : ''}<br>
      <span style="color:${o.result === 'review' ? '#b45309' : '#b91c1c'}; font-size: 13px;">${RESULT_LABEL[o.result]}</span>
      <span style="color:#6b7280; font-size: 13px;"> — ${esc(o.detail)}</span></li>`).join('')
    const html = shell(appUrl, `<p style="margin: 0 0 16px;">Last night's check of <strong>${esc(company.name as string)}</strong>'s state licenses against the states' published lists:</p>
      <p style="margin: 0 0 16px;"><strong>${mine.length - bad.length}</strong> of ${mine.length} verified.${bad.length ? ` <strong>${bad.length}</strong> need attention:` : ' Nothing needs attention.'}</p>
      ${bad.length ? `<ul style="margin: 0; padding-left: 20px;">${rows}</ul>` : ''}`)

    for (const address of to) {
      try {
        const { error } = await resend.emails.send({ from: EMAIL_FROM, to: address, subject, html })
        if (error) throw error
        emails++
      } catch (err) {
        failed++
        const reason = err as { name?: string; statusCode?: number }
        console.error('license check email failed', reason.statusCode ?? '', reason.name ?? '')   // no addresses logged
      }
    }
  }
  return { emails, failed }
}

export async function runLicenseVerification(db: SupabaseClient, appUrl: string) {
  const synced = await syncStates(db)
  const { outcomes, ...verified } = await verifyAll(db)
  const email = await sendNightlyEmails(db, outcomes, appUrl)
  return { synced, verified, email }
}
