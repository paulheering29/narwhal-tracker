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
