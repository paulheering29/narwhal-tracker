import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageTrainings } from '@/lib/permissions'
import { createBunnyVideo, buildTusUploadAuth } from '@/lib/bunny'

export async function POST(request: NextRequest) {
  const { courseId, title } = await request.json()
  if (!courseId || !title) {
    return NextResponse.json({ error: 'courseId and title are required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Bunny video creation has a real dollar cost, so this route checks the
  // Trainer/Admin/Account Owner roles on top of the tier RLS already
  // enforces elsewhere in the app.
  const service = createServiceClient()
  const { data: caller } = await service
    .from('staff')
    .select('company_id, tier, roles')
    .eq('auth_id', user.id)
    .single()

  if (!caller || caller.tier !== 'staff' || !canManageTrainings(caller.roles ?? [])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: course } = await service
    .from('courses')
    .select('id, company_id, course_type')
    .eq('id', courseId)
    .single()

  if (!course || course.company_id !== caller.company_id || course.course_type !== 'streamed') {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 })
  }

  let videoId: string
  try {
    videoId = await createBunnyVideo(title)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bunny video creation failed.' },
      { status: 502 },
    )
  }

  return NextResponse.json(buildTusUploadAuth(videoId))
}
