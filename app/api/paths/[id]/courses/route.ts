import { NextRequest, NextResponse } from 'next/server'
import { requirePathManager } from '@/lib/learning-paths'

// Set the path's full, ordered course list. Adds go to people who haven't
// completed the path; removals only take back untouched path-created
// assignments (see sync_learning_path_courses).
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requirePathManager(params.id)
  if ('error' in gate) return gate.error

  const body = await request.json().catch(() => null)
  const courseIds: string[] = Array.isArray(body?.courseIds)
    ? body.courseIds.filter((c: unknown): c is string => typeof c === 'string')
    : []
  if (new Set(courseIds).size !== courseIds.length) {
    return NextResponse.json({ error: 'A course can only appear once in a path.' }, { status: 400 })
  }

  if (courseIds.length > 0) {
    const { data: courses } = await gate.service
      .from('courses')
      .select('id, course_type, company_id')
      .in('id', courseIds)
    const ok = (courses ?? []).length === courseIds.length &&
      (courses ?? []).every(c => c.company_id === gate.companyId && c.course_type === 'streamed')
    if (!ok) return NextResponse.json({ error: 'Only self-paced courses from your organization can be added.' }, { status: 400 })
  }

  const { error } = await gate.service.rpc('sync_learning_path_courses', {
    p_path_id: params.id, p_course_ids: courseIds,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
