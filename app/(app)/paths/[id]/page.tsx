import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageTrainings } from '@/lib/permissions'
import { PathDetailClient, type CourseStatus, type PathDetail } from './client'

export default async function PathDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('staff')
    .select('tier, roles')
    .eq('auth_id', user.id)
    .single()
  if (!me || me.tier !== 'staff' || !canManageTrainings(me.roles ?? [])) redirect('/dashboard')

  const { data: path } = await supabase
    .from('learning_paths')
    .select('id, name, description, sequential, archived_at')
    .eq('id', params.id)
    .single()
  if (!path) notFound()

  const [{ data: pathCourses }, { data: assignments }, { data: streamed }, { data: staff }] = await Promise.all([
    supabase
      .from('learning_path_courses')
      .select('course_id, order_index, courses(id, name, units, ethics_units, supervision_units)')
      .eq('path_id', path.id)
      .order('order_index'),
    supabase
      .from('learning_path_assignments')
      .select('id, staff_id, assigned_at, completed_at, staff:staff_id(id, first_name, last_name, display_first_name, display_last_name, role)')
      .eq('path_id', path.id),
    supabase
      .from('courses')
      .select('id, name, units')
      .eq('course_type', 'streamed')
      .order('name'),
    supabase
      .from('staff')
      .select('id, first_name, last_name, display_first_name, display_last_name, role')
      .eq('active', true)
      .order('last_name'),
  ])

  const courses = (pathCourses ?? []).map(pc => {
    const c = Array.isArray(pc.courses) ? pc.courses[0] : pc.courses
    return {
      id: pc.course_id as string,
      name: c?.name ?? 'Untitled course',
      units: Number(c?.units ?? 0),
      ethicsUnits: Number(c?.ethics_units ?? 0),
      supervisionUnits: Number(c?.supervision_units ?? 0),
    }
  })

  // Per-person status for each course: done = confirmed record (a pass before
  // the path was assigned counts); in progress = any watch progress; locked =
  // sequential path and an earlier course isn't done yet.
  const staffIds  = (assignments ?? []).map(a => a.staff_id as string)
  const courseIds = courses.map(c => c.id)
  const [{ data: confirmed }, { data: watched }] = staffIds.length && courseIds.length
    ? await Promise.all([
        supabase.from('training_records').select('staff_id, course_id').eq('confirmed', true).in('staff_id', staffIds).in('course_id', courseIds),
        supabase.from('course_watch_progress').select('staff_id, course_id').in('staff_id', staffIds).in('course_id', courseIds),
      ])
    : [{ data: [] }, { data: [] }]
  const doneSet    = new Set((confirmed ?? []).map(r => `${r.staff_id}:${r.course_id}`))
  const startedSet = new Set((watched   ?? []).map(r => `${r.staff_id}:${r.course_id}`))

  const assignees = (assignments ?? []).map(a => {
    const s = (Array.isArray(a.staff) ? a.staff[0] : a.staff) as PathDetail['assignees'][number]['staff'] | null
    let earlierDone = true
    const statuses: CourseStatus[] = courses.map(c => {
      const key = `${a.staff_id}:${c.id}`
      const status: CourseStatus =
        doneSet.has(key)    ? 'done' :
        startedSet.has(key) ? 'in_progress' :
        path.sequential && !earlierDone ? 'locked' : 'not_started'
      if (status !== 'done') earlierDone = false
      return status
    })
    return {
      staffId: a.staff_id as string,
      staff: s!,
      assignedAt: a.assigned_at as string,
      completedAt: (a.completed_at as string | null) ?? null,
      statuses,
    }
  }).filter(a => a.staff)

  const detail: PathDetail = {
    id: path.id, name: path.name, description: path.description, sequential: path.sequential,
    archived: !!path.archived_at,
    courses,
    assignees,
    streamedCourses: (streamed ?? []).map(c => ({ id: c.id, name: c.name, units: Number(c.units ?? 0) })),
    staff: staff ?? [],
  }
  return <PathDetailClient path={detail} />
}
