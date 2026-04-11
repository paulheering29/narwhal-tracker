import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardCards, type DashboardCardData } from './dashboard-cards'

async function getDashboardData(supabase: Awaited<ReturnType<typeof createClient>>) {
  const today    = new Date().toISOString().split('T')[0]
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    rbtListRes,
    trainersListRes,
    cyclesRes,
    upcomingCoursesRes,
    allCoursesRes,
    recentRecordsRes,
  ] = await Promise.all([
    // Active RBTs
    supabase
      .from('staff')
      .select('id, first_name, last_name')
      .eq('active', true)
      .eq('role', 'RBT')
      .order('last_name')
      .limit(25),
    // Active Trainers / Admins (anyone not an RBT)
    supabase
      .from('staff')
      .select('id, first_name, last_name, role')
      .eq('active', true)
      .neq('role', 'RBT')
      .order('last_name')
      .limit(25),
    // All cycles — used for expiry list
    supabase
      .from('certification_cycles')
      .select('id, staff_id, end_date, start_date, staff(id, first_name, last_name)'),
    // Upcoming trainings (next 30 days)
    supabase
      .from('courses')
      .select('id, name, date')
      .gte('date', today)
      .lte('date', in30Days)
      .order('date')
      .limit(25),
    // All trainings (for the Trainings card list)
    supabase
      .from('courses')
      .select('id, name, date')
      .order('date', { ascending: false })
      .limit(25),
    // Recent training records (for "Trainings Completed" card list)
    supabase
      .from('training_records')
      .select('id, completed_date, staff:staff_id(first_name, last_name), courses:course_id(id, name)')
      .eq('confirmed', true)
      .order('completed_date', { ascending: false })
      .limit(25),
  ])

  // ── Expiring cycles (next 30 days, dedup by staff, skip if newer cycle already scheduled)
  const allCycles = cyclesRes.data ?? []
  const expiringSoon = allCycles.filter(c => c.end_date >= today && c.end_date <= in30Days)
  const expiringFiltered = expiringSoon.filter(expiring =>
    !allCycles.some(
      other => other.staff_id === expiring.staff_id && other.start_date > expiring.end_date,
    ),
  )
  const seenStaff = new Set<string>()
  const expiringUnique = expiringFiltered.filter(c => {
    if (seenStaff.has(c.staff_id)) return false
    seenStaff.add(c.staff_id)
    return true
  })

  return {
    rbtList:         rbtListRes.data         ?? [],
    trainersList:    trainersListRes.data    ?? [],
    expiringUnique,
    upcomingCourses: upcomingCoursesRes.data ?? [],
    allCourses:      allCoursesRes.data      ?? [],
    recentRecords:   recentRecordsRes.data   ?? [],
  }
}

async function getExactCounts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const today    = new Date().toISOString().split('T')[0]
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [rbtCount, trainerCount, upcomingCount, allCoursesCount, recordsCount] = await Promise.all([
    supabase.from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('active', true).eq('role', 'RBT'),
    supabase.from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('active', true).neq('role', 'RBT'),
    supabase.from('courses')
      .select('id', { count: 'exact', head: true })
      .gte('date', today).lte('date', in30Days),
    supabase.from('courses')
      .select('id', { count: 'exact', head: true })
      .not('name', 'is', null),
    supabase.from('training_records')
      .select('id', { count: 'exact', head: true })
      .eq('confirmed', true),
  ])

  return {
    rbts:                rbtCount.count         ?? 0,
    trainersAndAdmin:    trainerCount.count     ?? 0,
    upcomingTrainings:   upcomingCount.count    ?? 0,
    allTrainings:        allCoursesCount.count  ?? 0,
    trainingsCompleted:  recordsCount.count     ?? 0,
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [data, counts] = await Promise.all([
    getDashboardData(supabase),
    getExactCounts(supabase),
  ])

  function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return ''
    const [y, m, d] = dateStr.split('-')
    return `${m}/${d}/${y}`
  }

  const cards: DashboardCardData[] = [
    // ─── Row 1 ─────────────────────────────────────────────────────────────
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
        return {
          id:       c.id,
          label:    name,
          sublabel: `Expires ${formatDate(c.end_date)}`,
          href:     `/staff/${c.staff_id}`,
        }
      }),
    },
    {
      title:          'Upcoming Trainings',
      value:          counts.upcomingTrainings,
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
      value:       counts.allTrainings,
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

    // ─── Row 2 ─────────────────────────────────────────────────────────────
    {
      title:       'RBTs',
      value:       counts.rbts,
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
      value:       counts.trainersAndAdmin,
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
      value:       counts.trainingsCompleted,
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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your training programme</p>
      </div>

      <DashboardCards cards={cards} />
    </div>
  )
}
