import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ExpiringSoonCard, type ExpiringItem } from './expiring-soon-card'
import { DonutCard } from './donut-card'
import { UnconfirmedCard, type UnconfirmedTraining } from './unconfirmed-card'
import { LapsedCard } from './lapsed-card'
import { getLapsed } from './lapsed-data'
import { RatingCard } from './rating-card'
import { CalendarCard } from './calendar-card'
import { GaugeCard } from './gauge-card'
import { CARD_INFO_DEFAULTS } from './card-info'
import { ModalityCard } from './modality-card'
import { getModalityCounts } from './modality-data'
import { getPaceSummaries } from './pace-data'
import { PersonalDashboard } from './personal-dashboard'
import { getPersonalDashboardData } from './personal-data'
import { getCredential } from '@/lib/credentials'
import { canManageTrainings } from '@/lib/permissions'
import { DashboardTabs } from './dashboard-tabs'

async function getDashboardData(supabase: Awaited<ReturnType<typeof createClient>>) {
  const today   = new Date().toISOString().split('T')[0]
  // Fetch the widest window the slider allows; the card narrows it client-side.
  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [expiringCycles, expiringLicenses] = await Promise.all([
    supabase
      .from('certification_cycles')
      .select('id, staff_id, end_date, start_date, certification_type, staff(id, first_name, last_name, is_supervisor)')
      .gte('end_date', today)
      .lte('end_date', in90Days),
    supabase
      .from('staff_licenses')
      .select('id, staff_id, expiration_date, jurisdiction_code, staff:staff_id(first_name, last_name), license_jurisdictions(name)')
      .eq('status', 'active')
      .gte('expiration_date', today)
      .lte('expiration_date', in90Days)
      .order('expiration_date'),
  ])

  // Drop expiring cycles whose owner already has a later cycle — we
  // need to check any newer start_date, so issue a second scoped query
  // for just the staff_ids we're about to flag.
  const staffIdsToCheck = Array.from(new Set((expiringCycles.data ?? []).map(c => c.staff_id as string)))
  let newerStartsByStaff = new Set<string>()
  if (staffIdsToCheck.length > 0) {
    const { data: newer } = await supabase
      .from('certification_cycles')
      .select('staff_id, start_date')
      .in('staff_id', staffIdsToCheck)
      .gt('start_date', today)
    newerStartsByStaff = new Set((newer ?? []).map(c => c.staff_id as string))
  }
  const seenStaff = new Set<string>()
  const expiringUnique = (expiringCycles.data ?? [])
    .filter(c => !newerStartsByStaff.has(c.staff_id as string))
    .filter(c => {
      const id = c.staff_id as string
      if (seenStaff.has(id)) return false
      seenStaff.add(id)
      return true
    })

  // Progress for each expiring person, against their own credential's
  // requirements: confirmed vs scheduled trainings in the cycle, plus outside
  // trainings (unless marked not approved), plus ethics / supervision.
  type Pacing = { done: number; scheduled: number; ethics: number; supervision: number }
  const pacingByStaff = new Map<string, Pacing>()
  const credByCode = new Map<string, {
    unit_label: string; units_required: number; ethics_units_required: number; supervision_units_required: number
  }>()
  if (expiringUnique.length > 0) {
    const expiringStaffIds = expiringUnique.map(c => c.staff_id as string)
    const cycleByStaff = new Map<string, { start: string; end: string; code: string }>()
    for (const c of expiringUnique) {
      cycleByStaff.set(c.staff_id as string, {
        start: c.start_date as string, end: c.end_date as string, code: String(c.certification_type).toUpperCase(),
      })
    }
    const [{ data: recs }, { data: outside }, { data: types }] = await Promise.all([
      supabase
        .from('training_records')
        .select('staff_id, completed_date, confirmed, no_show, courses(units, eligible_credentials, ethics_units, supervision_units)')
        .in('staff_id', expiringStaffIds),
      supabase
        .from('external_trainings')
        .select('staff_id, completed_date, units, ethics_units, supervision_units, review_status')
        .in('staff_id', expiringStaffIds),
      supabase
        .from('credential_types')
        .select('code, unit_label, units_required, ethics_units_required, supervision_units_required'),
    ])
    for (const t of types ?? []) {
      credByCode.set(String(t.code).toUpperCase(), {
        unit_label: t.unit_label as string,
        units_required: Number(t.units_required),
        ethics_units_required: Number(t.ethics_units_required),
        supervision_units_required: Number(t.supervision_units_required),
      })
    }
    for (const r of recs ?? []) {
      const staffId = r.staff_id as string
      const cycle   = cycleByStaff.get(staffId)
      if (!cycle) continue
      const date = r.completed_date as string
      if (date < cycle.start || date > cycle.end) continue
      const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
      // A training only counts toward the credentials it's marked eligible for.
      if (!((course?.eligible_credentials as string[] | null) ?? ['RBT']).includes(cycle.code)) continue
      const units  = Number(course?.units ?? 0)
      const entry  = pacingByStaff.get(staffId) ?? { done: 0, scheduled: 0, ethics: 0, supervision: 0 }
      if (r.confirmed) {
        entry.done        += units
        entry.ethics      += Number(course?.ethics_units ?? 0)
        entry.supervision += Number(course?.supervision_units ?? 0)
      } else if (!r.no_show) {
        entry.scheduled   += units
      }
      pacingByStaff.set(staffId, entry)
    }
    for (const t of outside ?? []) {
      const staffId = t.staff_id as string
      const cycle   = cycleByStaff.get(staffId)
      if (!cycle || t.review_status === 'not_approved') continue
      const date = t.completed_date as string
      if (date < cycle.start || date > cycle.end) continue
      const entry = pacingByStaff.get(staffId) ?? { done: 0, scheduled: 0, ethics: 0, supervision: 0 }
      entry.done        += Number(t.units)
      entry.ethics      += Number(t.ethics_units)
      entry.supervision += Number(t.supervision_units)
      pacingByStaff.set(staffId, entry)
    }
  }

  return {
    expiringUnique,
    expiringLicenses: expiringLicenses.data ?? [],
    pacingByStaff,
    credByCode,
  }
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: staff } = await supabase
    .from('staff')
    .select('id, tier, role, roles, is_supervisor')
    .eq('auth_id', user.id)
    .single()

  // The company view needs a management role (Trainer / Admin / Account Owner);
  // a BCBA with no permissions is a staff-tier login but only gets their own.
  const canSeeCompany = (staff?.tier ?? 'rbt') !== 'rbt' && canManageTrainings((staff?.roles ?? []) as string[])
  const credential    = staff?.id ? await getCredential(supabase, staff.role) : null
  // Someone who manages the company and also holds a credential (a BCBA who
  // trains, an RBT who runs the tracking) gets both dashboards.
  const hasBoth  = canSeeCompany && credential !== null
  const showMine = !canSeeCompany || (hasBoth && view === 'my')

  if (showMine && staff?.id) {
    const personal = await getPersonalDashboardData(supabase, staff.id, credential, staff.is_supervisor ?? false)
    return (
      <div className="p-4 md:p-8">
        {hasBoth && <DashboardTabs active="my" />}
        <PersonalDashboard data={personal} />
      </div>
    )
  }

  const activeStaffCount = (role: string) =>
    supabase.from('staff').select('id', { count: 'exact', head: true }).eq('active', true).eq('role', role)

  const [data, { count: pendingReviews }, { count: rbtCount }, { count: bcbaCount }, pace, modality, { data: liveCourses }, { data: unconfirmedRecords }, { data: reviewRows }, lapsed, { data: infoRows }] = await Promise.all([
    getDashboardData(supabase),
    supabase.from('external_trainings').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
    activeStaffCount('RBT'),
    activeStaffCount('BCBA'),
    getPaceSummaries(supabase, ['BCBA', 'RBT']),
    getModalityCounts(supabase, ['BCBA', 'RBT']),
    supabase.from('courses').select('id, name, date, start_time').eq('course_type', 'live').not('date', 'is', null).order('date'),
    // Past live trainings with at least one registrant whose attendance was never confirmed.
    supabase
      .from('training_records')
      .select('staff_id, courses:course_id!inner(id, name, date, course_type)')
      .eq('confirmed', false)
      .eq('no_show', false)
      .eq('courses.course_type', 'live')
      .lt('courses.date', new Date().toISOString().split('T')[0]),
    supabase.from('course_reviews').select('rating, created_at'),
    getLapsed(supabase),
    // Editable tooltip text; if the table is missing or empty we fall back to the defaults.
    supabase.from('dashboard_card_info').select('card_key, explanation'),
  ])

  function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return ''
    const [y, m, d] = dateStr.split('-')
    return `${m}/${d}/${y}`
  }

  const items: ExpiringItem[] = [
        ...data.expiringUnique.map((c): ExpiringItem => {
        const staff = Array.isArray(c.staff) ? c.staff[0] : c.staff
        const name  = staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown'
        const pacing = data.pacingByStaff.get(c.staff_id as string) ?? { done: 0, scheduled: 0, ethics: 0, supervision: 0 }
        const cred   = data.credByCode.get(String(c.certification_type).toUpperCase())
        const TOTAL  = cred?.units_required ?? 12
        const label  = cred?.unit_label ?? 'PDU'
        const ethicsNeeded      = cred?.ethics_units_required ?? 0
        const supervisionNeeded = staff?.is_supervisor ? (cred?.supervision_units_required ?? 0) : 0
        const ethicsLeft      = Math.max(0, ethicsNeeded      - pacing.ethics)
        const supervisionLeft = Math.max(0, supervisionNeeded - pacing.supervision)
        const complete  = pacing.done >= TOTAL && ethicsLeft === 0 && supervisionLeft === 0
        const committed = pacing.done + pacing.scheduled
        const pct = Math.min(1, committed / TOTAL)
        const status: 'done' | 'scheduled' | 'behind' =
          complete             ? 'done'      :
          committed >= TOTAL   ? 'scheduled' :
                                 'behind'
        const gaps = [
          ethicsLeft      > 0 ? `${ethicsLeft} ethics`           : '',
          supervisionLeft > 0 ? `${supervisionLeft} supervision` : '',
        ].filter(Boolean)
        return {
          id:       c.id,
          date:     c.end_date as string,
          label:    name,
          sublabel: `Expires ${formatDate(c.end_date)} · ${Number(pacing.done.toFixed(2))}/${TOTAL} ${label}s${gaps.length ? ` · needs ${gaps.join(' + ')}` : ''}`,
          href:     `/staff/${c.staff_id}`,
          progress: { pct, status },
          badge:    complete ? { label: 'All requirements met' } : undefined,
        }
        }),
        ...data.expiringLicenses.map((l): ExpiringItem => {
        const staff = Array.isArray(l.staff) ? l.staff[0] : l.staff
        const state = Array.isArray(l.license_jurisdictions) ? l.license_jurisdictions[0] : l.license_jurisdictions
        return {
          id:       `license-${l.id}`,
          date:     l.expiration_date as string,
          label:    staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown',
          sublabel: `${state?.name ?? l.jurisdiction_code} license expires ${formatDate(l.expiration_date)}`,
          href:     `/staff/${l.staff_id}`,
        }
        }),
  ]

  const unconfirmedByCourse = new Map<string, UnconfirmedTraining>()
  const unconfirmedStaff = new Set<string>()
  for (const r of unconfirmedRecords ?? []) {
    const c = Array.isArray(r.courses) ? r.courses[0] : r.courses
    if (!c) continue
    unconfirmedStaff.add(r.staff_id as string)
    const entry = unconfirmedByCourse.get(c.id) ?? { id: c.id, name: c.name, date: c.date as string, unconfirmed: 0 }
    entry.unconfirmed++
    unconfirmedByCourse.set(c.id, entry)
  }
  const unconfirmedTrainings = Array.from(unconfirmedByCourse.values()).sort((a, b) => b.date.localeCompare(a.date))

  const modalityCard = (code: string, label: string) => (
    <ModalityCard subtitle={label} info={info(`modality_${code.toLowerCase()}`)} counts={modality[code]} />
  )

  const infoText = new Map((infoRows ?? []).map(r => [r.card_key as string, r.explanation as string]))
  const info = (key: string) => infoText.get(key) ?? CARD_INFO_DEFAULTS[key] ?? ''

  const paceGauge = (title: ReactNode, key: string, code: string, s: { onPace: number; behind: number }) => {
    const n = s.onPace + s.behind
    return (
      <GaugeCard
        title={title}
        info={info(key)}
        pct={n ? s.onPace / n : 0}
        hasData={n > 0}
        caption="on or ahead of pace"
        legend={[
          { label: 'On or ahead of pace', count: s.onPace, color: '#10b981' },
          { label: 'Behind pace',         count: s.behind, color: '#f43f5e', href: `/staff?tab=${code}&pace=behind` },
        ]}
      />
    )
  }

  return (
    <div className="p-4 md:p-8">
      {hasBoth && <DashboardTabs active="company" />}
      {(pendingReviews ?? 0) > 0 && (
        <Link
          href="/outside-trainings"
          className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors"
        >
          <span>
            <span className="font-semibold">{pendingReviews} outside training{pendingReviews === 1 ? '' : 's'}</span> waiting for review
          </span>
          <span className="font-medium whitespace-nowrap">Review →</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[24rem_auto] lg:items-start lg:justify-start">
        <div className="lg:h-[calc(100vh-8rem)]">
          <ExpiringSoonCard items={items} info={info('expiring_soon')} />
        </div>
        {/* Nested so each row of three stretches to one shared height */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[repeat(3,20rem)]">
          <LapsedCard items={lapsed} info={info('lapsed')} />
          {paceGauge(<>RBT<span className="normal-case">s</span></>, 'pace_rbt', 'RBT', pace.RBT)}
          {paceGauge(<>BCBA<span className="normal-case">s</span></>, 'pace_bcba', 'BCBA', pace.BCBA)}
          <CalendarCard
            info={info('calendar')}
            trainings={(liveCourses ?? []).map(c => ({ id: c.id, name: c.name, date: c.date as string, startTime: c.start_time }))}
          />
          <UnconfirmedCard trainings={unconfirmedTrainings} staffCount={unconfirmedStaff.size} info={info('unconfirmed')} />
          <DonutCard
            title="Staff"
            info={info('staff')}
            slices={[
              { label: 'RBT',  count: rbtCount ?? 0,  color: '#3b82f6' },
              { label: 'BCBA', count: bcbaCount ?? 0, color: '#f59e0b' },
            ]}
          />
          <RatingCard info={info('course_rating')} reviews={(reviewRows ?? []).map(r => ({ rating: Number(r.rating), createdAt: r.created_at as string }))} />
          {modalityCard('RBT', 'RBTs')}
          {modalityCard('BCBA', 'BCBAs')}
        </div>
      </div>
    </div>
  )
}
