import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageTrainings } from '@/lib/permissions'
import { ReviewsClient, type CourseAverage } from './client'

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

  const { data } = await supabase.from('course_reviews').select('rating, courses:course_id(id, name)')

  const byCourse = new Map<string, { name: string; sum: number; count: number }>()
  for (const r of data ?? []) {
    const course = r.courses as unknown as { id: string; name: string } | null
    if (!course) continue
    const entry = byCourse.get(course.id) ?? { name: course.name, sum: 0, count: 0 }
    entry.sum += Number(r.rating)
    entry.count += 1
    byCourse.set(course.id, entry)
  }

  const courses: CourseAverage[] = Array.from(byCourse.entries())
    .map(([id, c]) => ({ id, name: c.name, average: c.sum / c.count, count: c.count }))
    .sort((a, b) => b.average - a.average || b.count - a.count)

  return <ReviewsClient courses={courses} />
}
