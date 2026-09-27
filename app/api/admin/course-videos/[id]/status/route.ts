import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getBunnyVideoStatus } from '@/lib/bunny'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: caller } = await service
    .from('staff')
    .select('company_id, tier')
    .eq('auth_id', user.id)
    .single()
  if (!caller || caller.tier !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: video } = await service
    .from('course_videos')
    .select('id, company_id, bunny_video_id')
    .eq('id', params.id)
    .single()

  if (!video || video.company_id !== caller.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const status = await getBunnyVideoStatus(video.bunny_video_id)
    if (status.ready) {
      await service
        .from('course_videos')
        .update({ duration_seconds: status.durationSeconds })
        .eq('id', video.id)
    }
    return NextResponse.json(status)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bunny status check failed.' },
      { status: 502 },
    )
  }
}
