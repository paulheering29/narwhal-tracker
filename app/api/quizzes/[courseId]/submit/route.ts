import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasWatchedAllSections } from '@/lib/course-eligibility'

type SubmittedAnswer = { questionId: string; selectedOptionIndex: number }

export async function POST(request: NextRequest, { params }: { params: { courseId: string } }) {
  const body = await request.json()
  const answers: SubmittedAnswer[] = Array.isArray(body.answers) ? body.answers : []

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
    .select('id, company_id, validity_months')
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

  // Someone taking this for credit must have watched everything first. A
  // staff-tier user who isn't assigned is just previewing the quiz: they can
  // answer it, but the run is scored and thrown away — no attempt recorded
  // (it would skew the insights) and no certificate issued.
  const isPreview = !isAssigned
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
    .select('id, correct_option_index')
    .eq('quiz_id', quiz.id)
    .is('archived_at', null)
  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'This quiz has no questions yet.' }, { status: 400 })
  }

  const answerByQuestion = new Map(answers.map(a => [a.questionId, a.selectedOptionIndex]))
  let correctCount = 0
  const gradedAnswers = questions.map(q => {
    const selected = answerByQuestion.get(q.id) ?? -1
    const isCorrect = selected === q.correct_option_index
    if (isCorrect) correctCount += 1
    return { question_id: q.id, selected_option_index: selected, is_correct: isCorrect }
  })

  const scorePercentage = Math.round((correctCount / questions.length) * 10000) / 100
  const passed = scorePercentage >= quiz.pass_percentage

  const result = {
    scorePercentage,
    passed,
    passPercentage: quiz.pass_percentage,
    correctCount,
    totalQuestions: questions.length,
  }

  if (isPreview) {
    return NextResponse.json({
      ...result,
      attemptNumber:     null,
      recordId:          null,
      certificateIssued: false,
      preview:           true,
    })
  }

  const { data: lastAttempt } = await service
    .from('quiz_attempts')
    .select('attempt_number')
    .eq('quiz_id', quiz.id)
    .eq('staff_id', caller.id)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  const attemptNumber = (lastAttempt?.attempt_number ?? 0) + 1

  const { data: attempt, error: attemptErr } = await service
    .from('quiz_attempts')
    .insert({
      company_id:       caller.company_id,
      staff_id:         caller.id,
      quiz_id:          quiz.id,
      course_id:        course.id,
      attempt_number:   attemptNumber,
      score_percentage: scorePercentage,
      passed,
    })
    .select('id')
    .single()
  if (attemptErr || !attempt) {
    return NextResponse.json({ error: attemptErr?.message ?? 'Failed to record attempt.' }, { status: 500 })
  }

  const { error: answersErr } = await service.from('quiz_attempt_answers').insert(
    gradedAnswers.map(a => ({ company_id: caller.company_id, attempt_id: attempt.id, ...a })),
  )
  if (answersErr) {
    // An attempt with no answer rows would silently corrupt the per-question
    // insights, so drop it rather than leave a half-written attempt behind.
    await service.from('quiz_attempts').delete().eq('id', attempt.id)
    return NextResponse.json({ error: 'Failed to record your answers. Please try again.' }, { status: 500 })
  }

  let certificateIssued = false
  let recordId: string | null = null
  if (passed) {
    // No unique constraint on (staff_id, course_id), and assign/unassign
    // cycles can leave more than one row — prefer an already-confirmed one.
    const { data: existingRecords } = await service
      .from('training_records')
      .select('id, confirmed')
      .eq('staff_id', caller.id)
      .eq('course_id', course.id)
      .order('confirmed', { ascending: false })
      .limit(1)
    const existingRecord = existingRecords?.[0] ?? null

    if (existingRecord?.confirmed) {
      // Already confirmed from an earlier pass — leave it as it stands.
      recordId = existingRecord.id
    } else {
      const today = new Date().toISOString().split('T')[0]
      let expiryDate: string | null = null
      if (course.validity_months) {
        const d = new Date()
        d.setMonth(d.getMonth() + course.validity_months)
        expiryDate = d.toISOString().split('T')[0]
      }

      if (existingRecord) {
        // Confirm the pending row created when the course was assigned.
        await service.from('training_records').update({
          completed_date: today,
          expiry_date:    expiryDate,
          confirmed:      true,
          notes:          'Completed via self-paced course quiz',
        }).eq('id', existingRecord.id)
        recordId = existingRecord.id
      } else {
        const { data: newRecord } = await service.from('training_records').insert({
          company_id:     caller.company_id,
          staff_id:       caller.id,
          course_id:      course.id,
          completed_date: today,
          expiry_date:    expiryDate,
          confirmed:      true,
          notes:          'Completed via self-paced course quiz',
        }).select('id').single()
        recordId = newRecord?.id ?? null
      }
    }
    certificateIssued = true
  }

  return NextResponse.json({ ...result, attemptNumber, recordId, certificateIssued, preview: false })
}
