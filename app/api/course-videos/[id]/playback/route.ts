import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildSignedEmbedUrl } from '@/lib/bunny'
import { canAccessSection } from '@/lib/course-eligibility'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: caller } = await service
    .from('staff')
    .select('id, company_id, tier')
    .eq('auth_id', user.id)
    .single()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: video } = await service
    .from('course_videos')
    .select('id, company_id, course_id, order_index, bunny_video_id, duration_seconds')
    .eq('id', params.id)
    .single()
  if (!video || video.company_id !== caller.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Anyone who manages trainings can preview any section; everyone else must
  // be assigned to the course AND have finished the sections before this one.
  if (caller.tier !== 'staff') {
    const { data: assignment } = await service
      .from('course_assignments')
      .select('id')
      .eq('course_id', video.course_id)
      .eq('staff_id', caller.id)
      .maybeSingle()
    if (!assignment) return NextResponse.json({ error: 'Not assigned to this course.' }, { status: 403 })

    const unlocked = await canAccessSection(service, video.course_id, caller.id, video.order_index)
    if (!unlocked) {
      return NextResponse.json({ error: 'Finish the earlier sections first.' }, { status: 403 })
    }
  }

  const { data: progress } = await service
    .from('course_watch_progress')
    .select('furthest_second_reached, completed')
    .eq('course_video_id', video.id)
    .eq('staff_id', caller.id)
    .maybeSingle()

  return NextResponse.json({
    embedUrl:         buildSignedEmbedUrl(video.bunny_video_id),
    durationSeconds:  video.duration_seconds,
    furthestReached:  progress?.furthest_second_reached ?? 0,
    completed:        progress?.completed ?? false,
  })
}
