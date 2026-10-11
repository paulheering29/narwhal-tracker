import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * True once every section (course_video) in a streamed course has been
 * marked completed in this staff member's watch progress. This is the
 * server-side gate the quiz API routes check — the player only hides the
 * quiz UI until this is true, it doesn't enforce it.
 */
export async function hasWatchedAllSections(
  service: SupabaseClient,
  courseId: string,
  staffId: string,
): Promise<boolean> {
  const { data: videos } = await service
    .from('course_videos')
    .select('id')
    .eq('course_id', courseId)

  if (!videos || videos.length === 0) return false

  const { data: progress } = await service
    .from('course_watch_progress')
    .select('course_video_id')
    .eq('staff_id', staffId)
    .in('course_video_id', videos.map(v => v.id))
    .eq('completed', true)

  return (progress?.length ?? 0) >= videos.length
}

/**
 * True if this staff member is allowed to open the given section yet —
 * i.e. every earlier section in the course is already complete. The player
 * greys out locked sections, but that's cosmetic; this is what actually
 * stops someone requesting a signed URL for section 5 on day one.
 */
export async function canAccessSection(
  service: SupabaseClient,
  courseId: string,
  staffId: string,
  orderIndex: number,
): Promise<boolean> {
  const { data: earlier } = await service
    .from('course_videos')
    .select('id')
    .eq('course_id', courseId)
    .lt('order_index', orderIndex)

  if (!earlier || earlier.length === 0) return true

  const { data: progress } = await service
    .from('course_watch_progress')
    .select('course_video_id')
    .eq('staff_id', staffId)
    .in('course_video_id', earlier.map(v => v.id))
    .eq('completed', true)

  return (progress?.length ?? 0) >= earlier.length
}

/**
 * If this person is assigned a sequential learning path that contains the
 * course and has an earlier course they haven't finished, returns that earlier
 * course (and the path). Otherwise null. "Finished" = a confirmed
 * training_records row, which the quiz submit route writes — so a course passed
 * before the path was assigned counts.
 *
 * Archived paths still count: archiving hides a path from builders, but
 * existing assignments keep working as they were.
 */
export async function getPathBlocker(
  service: SupabaseClient,
  courseId: string,
  staffId: string,
): Promise<{ courseId: string; courseName: string; pathName: string } | null> {
  const { data: assignments } = await service
    .from('learning_path_assignments')
    .select('path_id, learning_paths!inner(name, sequential)')
    .eq('staff_id', staffId)
  const sequential = (assignments ?? []).filter(a => {
    const p = Array.isArray(a.learning_paths) ? a.learning_paths[0] : a.learning_paths
    return p?.sequential
  })
  if (sequential.length === 0) return null

  const { data: pathCourses } = await service
    .from('learning_path_courses')
    .select('path_id, course_id, order_index, courses(name)')
    .in('path_id', sequential.map(a => a.path_id))
    .order('order_index')
  if (!pathCourses || pathCourses.length === 0) return null

  const { data: done } = await service
    .from('training_records')
    .select('course_id')
    .eq('staff_id', staffId)
    .eq('confirmed', true)
    .in('course_id', Array.from(new Set(pathCourses.map(c => c.course_id))))
  const completed = new Set((done ?? []).map(r => r.course_id as string))

  for (const a of sequential) {
    const inPath = pathCourses.filter(c => c.path_id === a.path_id)   // already ordered
    const idx = inPath.findIndex(c => c.course_id === courseId)
    if (idx <= 0) continue
    const missing = inPath.slice(0, idx).find(c => !completed.has(c.course_id as string))
    if (missing) {
      const course = Array.isArray(missing.courses) ? missing.courses[0] : missing.courses
      const path = Array.isArray(a.learning_paths) ? a.learning_paths[0] : a.learning_paths
      return { courseId: missing.course_id as string, courseName: course?.name ?? 'the previous course', pathName: path?.name ?? 'your learning path' }
    }
  }
  return null
}

/** False when a sequential learning path says an earlier course must be finished first. */
export async function canStartCourseInPaths(
  service: SupabaseClient,
  courseId: string,
  staffId: string,
): Promise<boolean> {
  return (await getPathBlocker(service, courseId, staffId)) === null
}
