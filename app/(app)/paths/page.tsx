import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageTrainings } from '@/lib/permissions'
import { PathsListClient, type PathRow } from './client'

// Learning paths: ordered sets of self-paced courses assigned as one unit.
export default async function PathsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('staff')
    .select('tier, roles')
    .eq('auth_id', user.id)
    .single()
  if (!me || me.tier !== 'staff' || !canManageTrainings(me.roles ?? [])) redirect('/dashboard')

  const [{ data: paths }, { data: pathCourses }, { data: assignments }] = await Promise.all([
    supabase.from('learning_paths').select('id, name, description, sequential, archived_at').order('name'),
    supabase.from('learning_path_courses').select('path_id, courses(units, ethics_units, supervision_units)'),
    supabase.from('learning_path_assignments').select('path_id, completed_at'),
  ])

  const rows: PathRow[] = (paths ?? []).map(p => {
    const mine = (pathCourses ?? []).filter(c => c.path_id === p.id)
    const sum = (key: 'units' | 'ethics_units' | 'supervision_units') =>
      mine.reduce((total, c) => {
        const course = Array.isArray(c.courses) ? c.courses[0] : c.courses
        return total + Number(course?.[key] ?? 0)
      }, 0)
    const assigned = (assignments ?? []).filter(a => a.path_id === p.id)
    return {
      id: p.id, name: p.name, description: p.description, sequential: p.sequential,
      archived: !!p.archived_at,
      courseCount: mine.length,
      units: sum('units'), ethicsUnits: sum('ethics_units'), supervisionUnits: sum('supervision_units'),
      assignedCount: assigned.length,
      completedCount: assigned.filter(a => a.completed_at).length,
    }
  })

  return <PathsListClient rows={rows} />
}
