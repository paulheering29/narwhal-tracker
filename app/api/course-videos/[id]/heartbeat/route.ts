import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const COMPLETE_THRESHOLD = 0.95

// The ceiling on how far `furthest_second_reached` may advance in a single
// heartbeat. This is the whole anti-skip mechanism: progress is rate-limited
// by real elapsed wall-clock time, so finishing an N-minute video takes N
// minutes no matter what the client claims.
//
// Generous enough (90s) to survive a backgrounded tab, where browsers throttle
// setInterval to roughly once a minute and a legitimate viewer would otherwise
// be under-credited.
const MAX_ADVANCE_PER_BEAT_SECONDS = 90

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { currentTime } = await request.json()
  if (typeof currentTime !== 'number' || !Number.isFinite(currentTime) || currentTime < 0) {
    return NextResponse.json({ error: 'currentTime must be a non-negative number.' }, { status: 400 })
  }

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
    .select('id, company_id, course_id, order_index, duration_seconds')
    .eq('id', params.id)
    .single()
  if (!video || video.company_id !== caller.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Mirror the playback route: only people actually assigned to the course
  // accrue progress against it (staff-tier previews don't get tracked).
  if (caller.tier !== 'staff') {
    const { data: assignment } = await service
      .from('course_assignments')
      .select('id')
      .eq('course_id', video.course_id)
      .eq('staff_id', caller.id)
      .maybeSingle()
    if (!assignment) return NextResponse.json({ error: 'Not assigned to this course.' }, { status: 403 })
  }

  const { data: existing } = await service
    .from('course_watch_progress')
    .select('furthest_second_reached, total_seconds_watched, updated_at')
    .eq('staff_id', caller.id)
    .eq('course_video_id', video.id)
    .maybeSingle()

  const now = new Date()
  // Real seconds since this viewer's last heartbeat, capped. The cap is what
  // stops both a forged first beat (no prior row to measure against) and a
  // resume after a long idle gap from banking credit for time not watched.
  const secondsSinceLastBeat = existing
    ? Math.max(0, (now.getTime() - new Date(existing.updated_at).getTime()) / 1000)
    : MAX_ADVANCE_PER_BEAT_SECONDS
  const allowedAdvance = Math.min(secondsSinceLastBeat, MAX_ADVANCE_PER_BEAT_SECONDS)

  const priorFurthest = existing?.furthest_second_reached ?? 0
  const cappedTime = video.duration_seconds ? Math.min(currentTime, video.duration_seconds) : currentTime
  const newFurthest = Math.max(priorFurthest, Math.min(cappedTime, priorFurthest + allowedAdvance))

  const newTotalWatched = (existing?.total_seconds_watched ?? 0) + allowedAdvance

  const completed = video.duration_seconds != null && newFurthest >= video.duration_seconds * COMPLETE_THRESHOLD

  await service.from('course_watch_progress').upsert({
    company_id:              caller.company_id,
    staff_id:                caller.id,
    course_id:               video.course_id,
    course_video_id:         video.id,
    furthest_second_reached: newFurthest,
    total_seconds_watched:   newTotalWatched,
    completed,
    updated_at:              now.toISOString(),
  }, { onConflict: 'staff_id,course_video_id' })

  return NextResponse.json({ furthestReached: newFurthest, completed })
}
