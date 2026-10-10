import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardCards, type DashboardCardData } from './dashboard-cards'
import { PersonalDashboard } from './personal-dashboard'
import { getPersonalDashboardData } from './personal-data'
import { getCredential } from '@/lib/credentials'

async function getDashboardData(supabase: Awaited<ReturnType<typeof createClient>>) {
  const today    = new Date().toISOString().split('T')[0]
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Each query returns both the list (limited to 25) AND the exact
  // total count in one roundtrip via `{ count: 'exact' }`.
  const [
    rbtList,
    trainersList,
    expiringCycles,
    upcomingCourses,
    allCourses,
    recentRecords,
  ] = await Promise.all([
    supabase
      .from('staff')
      .select('id, first_name, last_name', { count: 'exact' })
      .eq('active', true)
      .eq('role', 'RBT')
      .order('last_name')
      .limit(25),
    supabase
      .from('staff')
      .select('id, first_name, last_name, role', { count: 'exact' })
      .eq('active', true)
      .neq('role', 'RBT')
      .order('last_name')
      .limit(25),
    // Only fetch cycles whose end_date lands in the next 30 days. The
    // trainings-completed card needs no full cycle table scan anymore.
    supabase
      .from('certification_cycles')
      .select('id, staff_id, end_date, start_date, certification_type, staff(id, first_name, last_name, is_supervisor)')
      .gte('end_date', today)
      .lte('end_date', in30Days),
    supabase
      .from('courses')
      .select('id, name, date', { count: 'exact' })
      .gte('date', today)
      .lte('date', in30Days)
      .order('date')
      .limit(25),
    supabase
      .from('courses')
      .select('id, name, date', { count: 'exact' })
      .not('name', 'is', null)
      .order('date', { ascending: false })
      .limit(25),
    supabase
      .from('training_records')
      .select('id, completed_date, staff:staff_id(first_name, last_name), courses:course_id(id, name)', { count: 'exact' })
      .eq('confirmed', true)
      .order('completed_date', { ascending: false })
      .limit(25),
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
        .select('staff_id, completed_date, confirmed, courses(units, eligible_credentials, ethics_units, supervision_units)')
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
      } else {
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
    rbtList:         rbtList.data         ?? [],
    rbtCount:        rbtList.count        ?? 0,
    trainersList:    trainersList.data    ?? [],
    trainersCount:   trainersList.count   ?? 0,
    expiringUnique,
    pacingByStaff,
    credByCode,
    upcomingCourses: upcomingCourses.data  ?? [],
    upcomingCount:   upcomingCourses.count ?? 0,
    allCourses:      allCourses.data      ?? [],
    allCoursesCount: allCourses.count     ?? 0,
    recentRecords:   recentRecords.data   ?? [],
    recordsCount:    recentRecords.count  ?? 0,
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: staff } = await supabase
    .from('staff')
    .select('id, tier, role, is_supervisor')
    .eq('auth_id', user.id)
    .single()

  if ((staff?.tier ?? 'rbt') === 'rbt' && staff?.id) {
    const credential = await getCredential(supabase, staff.role)
    const personal   = await getPersonalDashboardData(supabase, staff.id, credential, staff.is_supervisor ?? false)
    return (
      <div className="p-4 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">My Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Your certification, {credential ? `${credential.unit_label}s` : 'progress'}, and training</p>
        </div>
        <PersonalDashboard data={personal} />
      </div>
    )
  }

  const [data, { count: pendingReviews }] = await Promise.all([
    getDashboardData(supabase),
    supabase.from('external_trainings').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
  ])

  function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return ''
    const [y, m, d] = dateStr.split('-')
    return `${m}/${d}/${y}`
  }

  const cards: DashboardCardData[] = [
    {
      title:          'Expiring Soon',
      value:          data.expiringUnique.length,
      description:    'Certifications expiring in the next 30 days',
      icon:           'alert',
      color:          'rose',
      alwaysExpanded: true,
      items: data.expiringUnique.slice(0, 25).map(c => {
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
          label:    name,
          sublabel: `Expires ${formatDate(c.end_date)} · ${Number(pacing.done.toFixed(2))}/${TOTAL} ${label}s${gaps.length ? ` · needs ${gaps.join(' + ')}` : ''}`,
          href:     `/staff/${c.staff_id}`,
          progress: { pct, status },
          badge:    complete ? { label: 'All requirements met' } : undefined,
        }
      }),
    },
    {
      title:          'Upcoming Trainings',
      value:          data.upcomingCount,
      description:    'Trainings scheduled in the next 30 days',
      icon:           'calendar',
      color:          'emerald',
      alwaysExpanded: true,
      items: data.upcomingCourses.map(c => ({
        id:       c.id,
        label:    c.name,
        sublabel: formatDate(c.date),
        href:     `/trainings/${c.id}`,
      })),
    },
    {
      title:       'Trainings',
      value:       data.allCoursesCount,
      description: 'All trainings in the system',
      icon:        'book',
      color:       'violet',
      items: data.allCourses.map(c => ({
        id:       c.id,
        label:    c.name,
        sublabel: formatDate(c.date),
        href:     `/trainings/${c.id}`,
      })),
    },
    {
      title:       'RBTs',
      value:       data.rbtCount,
      description: 'Active RBTs',
      icon:        'users',
      color:       'blue',
      items: data.rbtList.map(s => ({
        id:    s.id,
        label: `${s.first_name} ${s.last_name}`,
        href:  `/staff/${s.id}`,
      })),
    },
    {
      title:       'Trainers & Admin',
      value:       data.trainersCount,
      description: 'Active trainers and administrators',
      icon:        'shield',
      color:       'amber',
      items: data.trainersList.map(s => ({
        id:       s.id,
        label:    `${s.first_name} ${s.last_name}`,
        sublabel: s.role ?? undefined,
        href:     `/staff/${s.id}`,
      })),
    },
    {
      title:       'Trainings Completed',
      value:       data.recordsCount,
      description: 'Confirmed training records to date',
      icon:        'clipboard',
      color:       'teal',
      items: data.recentRecords.map(r => {
        const staff  = Array.isArray(r.staff)   ? r.staff[0]   : r.staff
        const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
        const staffName = staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown'
        return {
          id:       r.id,
          label:    course?.name ?? 'Untitled training',
          sublabel: `${staffName} · ${formatDate(r.completed_date)}`,
          href:     course?.id ? `/trainings/${course.id}` : '#',
        }
      }),
    },
  ]

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your training programme</p>
      </div>

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

      <DashboardCards cards={cards} />
    </div>
  )
}
