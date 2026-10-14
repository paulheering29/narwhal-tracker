import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageTrainings } from '@/lib/permissions'
import { getDisplayName } from '@/lib/display-name'
import { ReviewsClient, type CourseAverage, type Summary, type Comment } from './client'

export default async function ReviewsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: staff } = await supabase
    .from('staff')
    .select('tier, roles')
    .eq('auth_id', user.id)
    .single()

  // Same gate as the company dashboard this page hangs off.
  if ((staff?.tier ?? 'rbt') === 'rbt' || !canManageTrainings((staff?.roles ?? []) as string[])) redirect('/dashboard')

  const { data: summaryRows } = await supabase.from('review_summaries').select('course_id, summary, generated_at')
  const { data } = await supabase.from('course_reviews').select('id, rating, comment, created_at, courses:course_id(id, name), staff:staff_id(first_name, last_name, display_first_name, display_last_name)').order('created_at', { ascending: false })

  const comments: Comment[] = []
  const byCourse = new Map<string, { name: string; sum: number; count: number }>()
  for (const r of data ?? []) {
    const course = r.courses as unknown as { id: string; name: string } | null
    if (!course) continue
    if (r.comment?.trim()) {
      const staff = r.staff as unknown as Parameters<typeof getDisplayName>[0] | null
      comments.push({
        id: r.id, courseId: course.id, courseName: course.name, rating: Number(r.rating),
        comment: r.comment.trim(), reviewer: staff ? getDisplayName(staff) : 'Unknown', createdAt: r.created_at as string,
      })
    }
    const entry = byCourse.get(course.id) ?? { name: course.name, sum: 0, count: 0 }
    entry.sum += Number(r.rating)
    entry.count += 1
    byCourse.set(course.id, entry)
  }

  const courses: CourseAverage[] = Array.from(byCourse.entries())
    .map(([id, c]) => ({ id, name: c.name, average: c.sum / c.count, count: c.count }))
    .sort((a, b) => b.average - a.average || b.count - a.count)

  return <ReviewsClient courses={courses} comments={comments} summaries={(summaryRows ?? []) as Summary[]} />
}
