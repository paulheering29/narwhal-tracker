import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasWatchedAllSections } from '@/lib/course-eligibility'

// Staff-facing: returns quiz questions WITHOUT correct_option_index, so the
// answer key never reaches the browser before grading. Admin authoring
// reads quiz_questions directly (it needs the answers) — this route is
// only for taking the quiz.
export async function GET(request: NextRequest, { params }: { params: { courseId: string } }) {
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

  const { data: course } = await service
    .from('courses')
    .select('id, company_id')
    .eq('id', params.courseId)
    .single()
  if (!course || course.company_id !== caller.company_id) {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 })
  }

  const { data: assignment } = await service
    .from('course_assignments')
    .select('id')
    .eq('course_id', course.id)
    .eq('staff_id', caller.id)
    .maybeSingle()
  const isAssigned = !!assignment

  if (!isAssigned && caller.tier !== 'staff') {
    return NextResponse.json({ error: 'Not assigned to this course.' }, { status: 403 })
  }

  // Assigned learners must finish the video first; an unassigned staff-tier
  // user is previewing, and their run is discarded on submit.
  if (isAssigned) {
    const watchedAll = await hasWatchedAllSections(service, course.id, caller.id)
    if (!watchedAll) {
      return NextResponse.json({ error: 'Complete every section before taking the quiz.' }, { status: 403 })
    }
  }

  const { data: quiz } = await service
    .from('quizzes')
    .select('id, pass_percentage')
    .eq('course_id', course.id)
    .maybeSingle()
  if (!quiz) return NextResponse.json({ error: 'No quiz has been configured for this course yet.' }, { status: 404 })

  const { data: questions } = await service
    .from('quiz_questions')
    .select('id, order_index, question_text, options')
    .eq('quiz_id', quiz.id)
    .is('archived_at', null)
    .order('order_index')

  return NextResponse.json({
    quizId:         quiz.id,
    passPercentage: quiz.pass_percentage,
    questions:      questions ?? [],
    preview:        !isAssigned,
  })
}
