import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardCards, type DashboardCardData } from './dashboard-cards'

async function getDashboardData(supabase: Awaited<ReturnType<typeof createClient>>) {
  const today = new Date().toISOString().split('T')[0]
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [staffRes, cyclesRes, upcomingCoursesRes, allCoursesRes] = await Promise.all([
    // Active staff (with names for detail list)
    supabase.from('staff').select('id, first_name, last_name').eq('active', true).order('last_name').limit(25),
    // All cycles — used for expiry logic and detail list
    supabase.from('certification_cycles').select('id, staff_id, end_date, start_date, staff(id, first_name, last_name)'),
    // Upcoming trainings
    supabase.from('courses').select('id, name, date').gt('date', today).order('date').limit(25),
    // All trainings
    supabase.from('courses').select('id, name, date').order('date', { ascending: false }).limit(25),
  ])

  // ── Active staff ──────────────────────────────────────────────────────────
  const staffList = staffRes.data ?? []

  // ── Expiring cycles ───────────────────────────────────────────────────────
  const allCycles = cyclesRes.data ?? []
  const expiringSoon = allCycles.filter(c => c.end_date >= today && c.end_date <= in30Days)
  const expiringFiltered = expiringSoon.filter(expiring =>
    !allCycles.some(
      other => other.staff_id === expiring.staff_id && other.start_date > expiring.end_date
    )
  )
  // Deduplicate by staff_id
  const seenStaff = new Set<string>()
  const expiringUnique = expiringFiltered.filter(c => {
    if (seenStaff.has(c.staff_id)) return false
    seenStaff.add(c.staff_id)
    return true
  })

  // ── Courses ───────────────────────────────────────────────────────────────
  const upcomingCourses = upcomingCoursesRes.data ?? []
  const allCourses = allCoursesRes.data ?? []

  return {
    staffList,
    expiringUnique,
    upcomingCourses,
    allCourses,
  }
}

async function getExactCounts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const today = new Date().toISOString().split('T')[0]
  const [staffCount, upcomingCount, allCount] = await Promise.all([
    supabase.from('staff').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('courses').select('id', { count: 'exact', head: true }).gt('date', today),
    supabase.from('courses').select('id', { count: 'exact', head: true }).not('name', 'is', null),
  ])
  return {
    activeStaff:       staffCount.count  ?? 0,
    upcomingTrainings: upcomingCount.count ?? 0,
    allTrainings:      allCount.count     ?? 0,
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
    {
      title:       'Staff',
      value:       counts.activeStaff,
      description: 'Currently active employees',
      icon:        'users',
      iconClass:   'text-blue-600',
      bgClass:     'bg-blue-50',
      items: data.staffList.slice(0, 25).map(s => ({
        id:    s.id,
        label: `${s.first_name} ${s.last_name}`,
        href:  `/staff/${s.id}`,
      })),
    },
    {
      title:       'Expiring in 30 Days',
      value:       data.expiringUnique.length,
      description: 'RBT certifications expiring soon',
      icon:        'alert',
      iconClass:   'text-amber-600',
      bgClass:     'bg-amber-50',
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
      title:       'Upcoming Trainings',
      value:       counts.upcomingTrainings,
      description: 'Trainings scheduled in the future',
      icon:        'book',
      iconClass:   'text-emerald-600',
      bgClass:     'bg-emerald-50',
      items: data.upcomingCourses.map(c => ({
        id:       c.id,
        label:    c.name,
        sublabel: formatDate(c.date),
        href:     `/trainings/${c.id}`,
      })),
    },
    {
      title:       'All Trainings',
      value:       counts.allTrainings,
      description: 'Total trainings in the system',
      icon:        'clipboard',
      iconClass:   'text-violet-600',
      bgClass:     'bg-violet-50',
      items: data.allCourses.map(c => ({
        id:       c.id,
        label:    c.name,
        sublabel: formatDate(c.date),
        href:     `/trainings/${c.id}`,
      })),
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
