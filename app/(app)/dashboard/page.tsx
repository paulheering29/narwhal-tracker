import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardCards, type DashboardCardData } from './dashboard-cards'
import { RbtDashboard, type RbtDashboardData } from './rbt-dashboard'

const RBT_PDU_TARGET = 12

function fmtDate(dateStr: string | null | undefined) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${m}/${d}/${y}`
}

// How many PDUs someone should have by today to stay on pace for
// RBT_PDU_TARGET by the end of their cycle — same formula used on the
// admin staff table (computePacingTarget in staff/client.tsx), duplicated
// here since that file is a client component.
function computePacingTarget(startDate: string, endDate: string): number {
  const todayMs = new Date(new Date().toDateString()).getTime()
  const startMs = new Date(startDate + 'T00:00:00').getTime()
  const endMs   = new Date(endDate   + 'T00:00:00').getTime()
  const total   = endMs - startMs
  if (total <= 0) return RBT_PDU_TARGET
  const elapsed = Math.max(0, Math.min(total, todayMs - startMs))
  return Math.round((elapsed / total) * RBT_PDU_TARGET * 2) / 2
}

async function getRbtDashboardData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  staffId: string,
): Promise<RbtDashboardData> {
  const today = new Date().toISOString().split('T')[0]

  const [cyclesRes, recordsRes, assignmentsRes] = await Promise.all([
    supabase
      .from('certification_cycles')
      .select('certification_type, start_date, end_date')
      .eq('staff_id', staffId)
      .order('end_date', { ascending: false }),
    supabase
      .from('training_records')
      .select('id, completed_date, confirmed, courses:course_id(id, name, units, course_type, date, start_time, end_time)')
      .eq('staff_id', staffId)
      .order('completed_date', { ascending: false }),
    supabase
      .from('course_assignments')
      .select('course_id, courses:course_id(id, name, units, course_type)')
      .eq('staff_id', staffId),
  ])

  const cycles = cyclesRes.data ?? []
  const activeCycle = cycles.find(c => c.start_date <= today && c.end_date >= today) ?? cycles[0] ?? null
  const daysUntilExpiry = activeCycle
    ? Math.ceil((new Date(activeCycle.end_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : null

  const records = (recordsRes.data ?? []) as unknown as {
    id: string; completed_date: string; confirmed: boolean
    courses: { id: string; name: string; units: number | null; course_type: string; date: string | null; start_time: string | null; end_time: string | null } | null
  }[]

  let pduDone = 0
  let pduScheduled = 0
  if (activeCycle) {
    for (const r of records) {
      if (r.completed_date < activeCycle.start_date || r.completed_date > activeCycle.end_date) continue
      const units = r.courses?.units ?? 0
      if (r.confirmed) pduDone += units
      else             pduScheduled += units
    }
  }

  const confirmedRecordCourseIds = new Set(records.filter(r => r.confirmed && r.courses).map(r => r.courses!.id))

  const completed = records
    .filter(r => r.confirmed && r.courses)
    .slice(0, 25)
    .map(r => ({
      id:       r.id,
      label:    r.courses!.name,
      sublabel: fmtDate(r.completed_date),
      href:     r.courses!.course_type === 'streamed' ? `/my-courses/${r.courses!.id}` : `/trainings/${r.courses!.id}`,
    }))

  const upcomingRaw = records
    .filter(r => r.courses?.course_type === 'live' && r.courses.date && r.courses.date >= today)
    .sort((a, b) => (a.courses!.date! < b.courses!.date! ? -1 : 1))
  const upcoming = upcomingRaw.slice(0, 25).map(r => ({
    id:       r.id,
    label:    r.courses!.name,
    sublabel: fmtDate(r.courses!.date),
    href:     `/trainings/${r.courses!.id}`,
  }))

  const assignments = (assignmentsRes.data ?? []) as unknown as {
    course_id: string; courses: { id: string; name: string; units: number | null; course_type: string } | null
  }[]
  const streamedAssignments = assignments.filter(a => a.courses?.course_type === 'streamed')
  const streamedCourseIds = streamedAssignments.map(a => a.course_id)

  const totalByCourse = new Map<string, number>()
  const completedSectionsByCourse = new Map<string, number>()
  if (streamedCourseIds.length > 0) {
    const [videosRes, progressRes] = await Promise.all([
      supabase.from('course_videos').select('id, course_id').in('course_id', streamedCourseIds),
      supabase.from('course_watch_progress').select('course_id, completed').eq('staff_id', staffId).in('course_id', streamedCourseIds),
    ])
    for (const v of videosRes.data ?? []) {
      totalByCourse.set(v.course_id, (totalByCourse.get(v.course_id) ?? 0) + 1)
    }
    for (const p of progressRes.data ?? []) {
      if (p.completed) completedSectionsByCourse.set(p.course_id, (completedSectionsByCourse.get(p.course_id) ?? 0) + 1)
    }
  }

  const assignedCourses = streamedAssignments
    .filter(a => a.courses)
    .map(a => {
      const totalSections     = totalByCourse.get(a.course_id) ?? 0
      const completedSections = completedSectionsByCourse.get(a.course_id) ?? 0
      const status: 'not_started' | 'in_progress' | 'complete' =
        confirmedRecordCourseIds.has(a.course_id) ? 'complete' : completedSections > 0 ? 'in_progress' : 'not_started'
      return {
        id: a.course_id, name: a.courses!.name, href: `/my-courses/${a.course_id}`,
        completedSections, totalSections, status,
      }
    })
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'complete' ? 1 : b.status === 'complete' ? -1 : 0))

  const pacingTarget = activeCycle ? computePacingTarget(activeCycle.start_date, activeCycle.end_date) : 0

  return {
    certType:         activeCycle?.certification_type ?? null,
    cycleEndDate:      activeCycle?.end_date ?? null,
    daysUntilExpiry,
    pduDone,
    pduScheduled,
    pduTarget:         RBT_PDU_TARGET,
    pacingTarget,
    assignedCourses,
    completed,
    completedCount:    records.filter(r => r.confirmed).length,
    upcoming,
    upcomingCount:     upcomingRaw.length,
  }
}

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
      .select('id, staff_id, end_date, start_date, staff(id, first_name, last_name)')
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

  // PDU pacing for each expiring RBT — tally confirmed vs scheduled
  // training records that fall inside their cycle window.
  const pacingByStaff = new Map<string, { done: number; scheduled: number }>()
  if (expiringUnique.length > 0) {
    const expiringStaffIds = expiringUnique.map(c => c.staff_id as string)
    const cycleByStaff = new Map<string, { start: string; end: string }>()
    for (const c of expiringUnique) {
      cycleByStaff.set(c.staff_id as string, { start: c.start_date as string, end: c.end_date as string })
    }
    const { data: recs } = await supabase
      .from('training_records')
      .select('staff_id, completed_date, confirmed, courses(units)')
      .in('staff_id', expiringStaffIds)
    for (const r of recs ?? []) {
      const staffId = r.staff_id as string
      const cycle   = cycleByStaff.get(staffId)
      if (!cycle) continue
      const date = r.completed_date as string
      if (date < cycle.start || date > cycle.end) continue
      const course = Array.isArray(r.courses) ? r.courses[0] : r.courses
      const units  = (course?.units as number | null | undefined) ?? 0
      const entry  = pacingByStaff.get(staffId) ?? { done: 0, scheduled: 0 }
      if (r.confirmed) entry.done      += units
      else             entry.scheduled += units
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
    .select('id, tier')
    .eq('auth_id', user.id)
    .single()

  if ((staff?.tier ?? 'rbt') === 'rbt' && staff?.id) {
    const rbtData = await getRbtDashboardData(supabase, staff.id)
    return (
      <div className="p-4 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">My Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Your certification, PDUs, and training</p>
        </div>
        <RbtDashboard data={rbtData} />
      </div>
    )
  }

  const data = await getDashboardData(supabase)

  function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return ''
    const [y, m, d] = dateStr.split('-')
    return `${m}/${d}/${y}`
  }

  const cards: DashboardCardData[] = [
    {
      title:          'Expiring Soon',
      value:          data.expiringUnique.length,
      description:    'RBT certifications expiring in the next 30 days',
      icon:           'alert',
      color:          'rose',
      alwaysExpanded: true,
      items: data.expiringUnique.slice(0, 25).map(c => {
        const staff = Array.isArray(c.staff) ? c.staff[0] : c.staff
        const name  = staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown'
        const pacing = data.pacingByStaff.get(c.staff_id as string) ?? { done: 0, scheduled: 0 }
        const TOTAL  = 12
        const committed = pacing.done + pacing.scheduled
        const pct = Math.min(1, committed / TOTAL)
        const status: 'done' | 'scheduled' | 'behind' =
          pacing.done >= TOTAL     ? 'done'      :
          committed   >= TOTAL     ? 'scheduled' :
                                     'behind'
        return {
          id:       c.id,
          label:    name,
          sublabel: `Expires ${formatDate(c.end_date)} · ${pacing.done}/${TOTAL} PDUs`,
          href:     `/staff/${c.staff_id}`,
          progress: { pct, status },
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

      <DashboardCards cards={cards} />
    </div>
  )
}
