import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { EMAIL_FROM } from '@/lib/email'
import {
  JURISDICTION_COLUMNS, LICENSE_COLUMNS, bacbEndsBeforeLicense,
  type Jurisdiction, type RequirementTopic, type StaffLicense,
} from '@/lib/licensure'
import {
  COMPLETION_COLUMNS, computeCeProgress, computeTopicStatuses, loadUnitEvents,
  type TopicCompletion,
} from '@/lib/licensure-progress'

const THRESHOLDS = [90, 60, 30]   // days before expiry

type Person = {
  first_name: string; last_name: string; display_first_name: string | null; display_last_name: string | null
  email: string | null; auth_id: string | null; active: boolean
}

type Item = {
  kind: 'license' | 'bacb_cycle'
  refId: string
  companyId: string
  staffId: string
  person: Person
  title: string            // "Texas license" / "BACB certification"
  detail: string | null    // license number, BACB warning…
  expiration: string
  days: number
  unsent: number[]         // thresholds that are due and haven't gone out yet
  cycleStart?: string      // BACB cycles: where the cycle began
  license?: StaffLicense   // licenses: the row, for CE hours and topics
  jurisdiction?: Jurisdiction
  progress: string[]       // lines like "24 of 32 CEUs · ethics 4 of 4 ✓"
  complete: boolean | null // everything required is done; null when there's nothing to measure
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}
const nameOf = (p: Person) =>
  `${p.display_first_name?.trim() || p.first_name} ${p.display_last_name?.trim() || p.last_name}`

export const shell = (appUrl: string, body: string) => `
  <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
    <div style="background: #025CA8; padding: 24px 32px; border-radius: 8px 8px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 20px;">Training Loop</h1>
    </div>
    <div style="background: #f9fafb; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
      ${body}
      <p style="margin: 24px 0 0;">
        <a href="${appUrl}/dashboard" style="display: inline-block; background: #025CA8; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Open Training Loop</a>
      </p>
    </div>
  </div>`

const line = (i: Item, withName: boolean) =>
  `<li style="margin: 0 0 12px;">${withName ? `<strong>${esc(nameOf(i.person))}</strong> · ` : ''}${esc(i.title)} expires ${fmtDate(i.expiration)}
   <span style="color:#6b7280;">(${i.days} day${i.days === 1 ? '' : 's'})</span>${i.detail ? `<br><span style="color:#6b7280; font-size: 13px;">${esc(i.detail)}</span>` : ''}${
     i.complete ? '<br><span style="color:#047857; font-size: 13px;">✓ All requirements met</span>' : ''}${
     i.progress.map(p => `<br><span style="color:#374151; font-size: 13px;">${esc(p)}</span>`).join('')}</li>`

const n = (v: number) => String(Number(v.toFixed(2)))

/**
 * Fill in each due item's progress: BACB CEUs (total, ethics, supervision) for
 * certification cycles; state CE hours, topics still due and BACB timing for
 * licenses. Uses the same calculations as the app's screens.
 */
async function addProgress(service: SupabaseClient, due: Item[], todayIso: string) {
  const staffIds = Array.from(new Set(due.map(i => i.staffId)))
  const licenseIds = due.filter(i => i.kind === 'license').map(i => i.refId)

  const [events, credRes, supervisorRes, cyclesRes, topicRes, compRes] = await Promise.all([
    loadUnitEvents(service, staffIds),
    service.from('credential_types').select('units_required, ethics_units_required, supervision_units_required').eq('code', 'BCBA').maybeSingle(),
    service.from('staff').select('id, is_supervisor').in('id', staffIds),
    service.from('certification_cycles').select('staff_id, end_date').eq('certification_type', 'BCBA').gte('end_date', todayIso).in('staff_id', staffIds),
    service.from('license_requirement_topics').select('*'),
    licenseIds.length
      ? service.from('staff_license_topic_completions').select(COMPLETION_COLUMNS).in('license_id', licenseIds)
      : Promise.resolve({ data: [] }),
  ])
  const cred = credRes.data
  const supervisors = new Set((supervisorRes.data ?? []).filter(s => s.is_supervisor).map(s => s.id as string))
  const bacbEnd = new Map<string, string>()
  for (const c of cyclesRes.data ?? []) {
    const id = c.staff_id as string
    if (!bacbEnd.has(id) || (c.end_date as string) < (bacbEnd.get(id) as string)) bacbEnd.set(id, c.end_date as string)
  }
  const topics = (topicRes.data ?? []) as RequirementTopic[]
  const completions = (compRes.data ?? []) as TopicCompletion[]

  for (const i of due) {
    const mine = events[i.staffId] ?? []

    if (i.kind === 'bacb_cycle' && cred && i.cycleStart) {
      let done = 0, ethics = 0, supervision = 0
      for (const e of mine) {
        if (e.date >= i.cycleStart && e.date <= i.expiration) { done += e.units; ethics += e.ethics; supervision += e.supervision }
      }
      const required = Number(cred.units_required)
      const ethicsReq = Number(cred.ethics_units_required)
      const supReq = supervisors.has(i.staffId) ? Number(cred.supervision_units_required) : 0
      const parts = [`${n(done)} of ${n(required)} CEUs`]
      if (ethicsReq > 0) parts.push(`ethics ${n(ethics)} of ${n(ethicsReq)}${ethics >= ethicsReq ? ' ✓' : ''}`)
      if (supReq > 0) parts.push(`supervision ${n(supervision)} of ${n(supReq)}${supervision >= supReq ? ' ✓' : ''}`)
      i.progress = [parts.join(' · ')]
      i.complete = done >= required && ethics >= ethicsReq && supervision >= supReq
    }

    if (i.kind === 'license' && i.license && i.jurisdiction) {
      const j = i.jurisdiction
      const jTopics = topics.filter(t => t.jurisdiction_code === i.license!.jurisdiction_code)
      const ce = computeCeProgress(i.license, j, mine, bacbEnd.has(i.staffId))
      const statuses = computeTopicStatuses(i.license, j, jTopics, completions)
      const due = statuses.filter(s => !s.done)
      const lines: string[] = []
      if (ce) {
        lines.push(ce.exempt ? 'State CE: not required this cycle'
          : ce.metByBacb ? 'State CE: met through the active BACB certification'
          : `State CE: ${n(ce.done)} of ${n(ce.required)} hours${ce.ethicsRequired > 0 ? ` · ethics ${n(ce.ethicsDone)} of ${n(ce.ethicsRequired)}` : ''}${ce.complete ? ' ✓' : ''}`)
      }
      if (statuses.length > 0) {
        lines.push(due.length === 0 ? 'Required topics: all done'
          : `Required topics still due: ${due.map(d => d.topic.name).join(', ')}`)
      }
      const shortBacb = bacbEndsBeforeLicense(i.license, j, bacbEnd.get(i.staffId))
      if (shortBacb) lines.push(`The BACB certification ends ${fmtDate(shortBacb)}, before this license expires. ${j.name} requires an active BACB certification.`)
      i.progress = lines
      i.complete = (ce ? ce.complete : true) && due.length === 0 && !shortBacb && (ce !== null || statuses.length > 0)
    }
  }
}

/**
 * Daily job: email reminders at 90, 60 and 30 days before a BCBA's state license
 * or BACB certification expires.
 *   • the BCBA gets one email listing what's coming up (if they have a login)
 *   • each company's admins and account owners get one digest of everything that
 *     went out that day
 * Each threshold goes out once per expiration date. If the job missed a day (or a
 * license was added late), only the nearest due threshold is sent and the ones
 * before it are marked as sent too, so nobody gets three emails at once.
 */
export async function runRenewalReminders(service: SupabaseClient, appUrl: string, today = new Date()) {
  const todayIso = today.toISOString().split('T')[0]
  const horizon = new Date(today.getTime() + 90 * 86400000).toISOString().split('T')[0]
  const daysTo = (iso: string) => Math.round((new Date(iso + 'T00:00:00Z').getTime() - new Date(todayIso + 'T00:00:00Z').getTime()) / 86400000)

  const { data: companies } = await service.from('companies').select('id, name').eq('license_reminders_enabled', true)
  const enabled = new Map((companies ?? []).map(c => [c.id as string, c.name as string]))
  if (enabled.size === 0) return { items: 0, emails: 0, failed: 0 }

  const personCols = 'first_name, last_name, display_first_name, display_last_name, email, auth_id, active'
  const [licRes, cycleRes] = await Promise.all([
    service.from('staff_licenses')
      .select(`${LICENSE_COLUMNS}, company_id, license_jurisdictions(${JURISDICTION_COLUMNS}), staff:staff_id(${personCols})`)
      .eq('status', 'active').gte('expiration_date', todayIso).lte('expiration_date', horizon),
    service.from('certification_cycles')
      .select(`id, company_id, staff_id, start_date, end_date, staff:staff_id(${personCols})`)
      .eq('certification_type', 'BCBA').gte('end_date', todayIso).lte('end_date', horizon),
  ])

  // A cycle that already has a newer one starting has been renewed.
  const cycleStaff = Array.from(new Set((cycleRes.data ?? []).map(c => c.staff_id as string)))
  const { data: newer } = cycleStaff.length
    ? await service.from('certification_cycles').select('staff_id').in('staff_id', cycleStaff).gt('start_date', todayIso)
    : { data: [] }
  const renewed = new Set((newer ?? []).map(n => n.staff_id as string))

  const items: Item[] = []
  for (const l of licRes.data ?? []) {
    const person = (Array.isArray(l.staff) ? l.staff[0] : l.staff) as Person | null
    const j = (Array.isArray(l.license_jurisdictions) ? l.license_jurisdictions[0] : l.license_jurisdictions) as Jurisdiction | undefined
    if (!person?.active || !enabled.has(l.company_id as string)) continue
    items.push({
      kind: 'license', refId: l.id as string, companyId: l.company_id as string, staffId: l.staff_id as string, person,
      title: `${j?.name ?? l.jurisdiction_code} license`,
      detail: l.license_number ? `License #${l.license_number}` : null,
      expiration: l.expiration_date as string, days: daysTo(l.expiration_date as string), unsent: [],
      license: l as unknown as StaffLicense, jurisdiction: j, progress: [], complete: null,
    })
  }
  for (const c of cycleRes.data ?? []) {
    const person = (Array.isArray(c.staff) ? c.staff[0] : c.staff) as Person | null
    if (!person?.active || !enabled.has(c.company_id as string) || renewed.has(c.staff_id as string)) continue
    items.push({
      kind: 'bacb_cycle', refId: c.id as string, companyId: c.company_id as string, staffId: c.staff_id as string, person,
      title: 'BACB certification', detail: null, expiration: c.end_date as string, days: daysTo(c.end_date as string), unsent: [],
      cycleStart: c.start_date as string, progress: [], complete: null,
    })
  }
  if (items.length === 0) return { items: 0, emails: 0, failed: 0 }

  const { data: sentRows } = await service.from('license_reminders_sent')
    .select('kind, ref_id, expiration_date, threshold').in('ref_id', items.map(i => i.refId))
  const sent = new Set((sentRows ?? []).map(r => `${r.kind}:${r.ref_id}:${r.expiration_date}:${r.threshold}`))
  const due: Item[] = []
  for (const i of items) {
    i.unsent = THRESHOLDS.filter(t => i.days <= t && !sent.has(`${i.kind}:${i.refId}:${i.expiration}:${t}`))
    if (i.unsent.length > 0) due.push(i)
  }
  if (due.length === 0) return { items: 0, emails: 0, failed: 0 }

  await addProgress(service, due, todayIso)

  const resend = new Resend(process.env.RESEND_API_KEY)
  let emails = 0, failed = 0
  const send = async (to: string, subject: string, html: string) => {
    try {
      const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html })
      if (error) throw error
      emails++
      return true
    } catch (err) {
      failed++
      const reason = err as { name?: string; statusCode?: number }
      console.error('renewal reminder email failed', reason.statusCode ?? '', reason.name ?? '')   // no addresses logged
      return false
    }
  }

  // Admin recipients, per company.
  const { data: admins } = await service.from('staff')
    .select('company_id, email')
    .in('company_id', Array.from(enabled.keys()))
    .eq('active', true).not('auth_id', 'is', null).not('email', 'is', null)
    .overlaps('roles', ['Admin', 'Account Owner'])
  const adminsByCompany = new Map<string, string[]>()
  for (const a of admins ?? []) {
    adminsByCompany.set(a.company_id as string, [...(adminsByCompany.get(a.company_id as string) ?? []), a.email as string])
  }

  const delivered = new Set<string>()   // items at least one email went out for (or nobody could be emailed)
  const key = (i: Item) => `${i.kind}:${i.refId}`

  // One email per BCBA with a login.
  const byStaff = new Map<string, Item[]>()
  for (const i of due) byStaff.set(i.staffId, [...(byStaff.get(i.staffId) ?? []), i])
  for (const list of Array.from(byStaff.values())) {
    const p = list[0].person
    if (!p.email || !p.auth_id) continue
    list.sort((a, b) => a.days - b.days)
    const ok = await send(
      p.email,
      list.length === 1 ? `${list[0].title} expires in ${list[0].days} day${list[0].days === 1 ? '' : 's'}` : 'Renewals coming up',
      shell(appUrl, `<p style="margin: 0 0 16px;">Hi ${esc(p.display_first_name?.trim() || p.first_name)},</p>
        <p style="margin: 0 0 16px;">A reminder about ${list.length === 1 ? 'a renewal' : 'renewals'} coming up:</p>
        <ul style="margin: 0; padding-left: 20px;">${list.map(i => line(i, false)).join('')}</ul>`),
    )
    if (ok) list.forEach(i => delivered.add(key(i)))
  }

  // One digest per company for its admins.
  const byCompany = new Map<string, Item[]>()
  for (const i of due) byCompany.set(i.companyId, [...(byCompany.get(i.companyId) ?? []), i])
  for (const [companyId, list] of Array.from(byCompany.entries())) {
    const recipients = Array.from(new Set(adminsByCompany.get(companyId) ?? []))
    list.sort((a, b) => a.days - b.days)
    let any = false
    for (const to of recipients) {
      const ok = await send(
        to, `Renewals coming up at ${enabled.get(companyId)}`,
        shell(appUrl, `<p style="margin: 0 0 16px;">These certifications and licenses are coming up for renewal at <strong>${esc(enabled.get(companyId) ?? '')}</strong>:</p>
          <ul style="margin: 0; padding-left: 20px;">${list.map(i => line(i, true)).join('')}</ul>`),
      )
      any = any || ok
    }
    if (any) list.forEach(i => delivered.add(key(i)))
  }

  // Anyone nobody could be emailed about (no logins, no admins) is marked too,
  // otherwise they'd be retried forever.
  for (const i of due) {
    const canEmailPerson = !!i.person.email && !!i.person.auth_id
    const hasAdmins = (adminsByCompany.get(i.companyId) ?? []).length > 0
    if (!canEmailPerson && !hasAdmins) delivered.add(key(i))
  }

  const rows = due.filter(i => delivered.has(key(i))).flatMap(i =>
    i.unsent.map(t => ({ kind: i.kind, ref_id: i.refId, expiration_date: i.expiration, threshold: t })))
  if (rows.length) {
    await service.from('license_reminders_sent').upsert(rows, { onConflict: 'kind,ref_id,expiration_date,threshold', ignoreDuplicates: true })
  }
  return { items: due.length, emails, failed }
}
