import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardCards, type DashboardCardData } from './dashboard-cards'

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
