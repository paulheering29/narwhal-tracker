import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopicAnalysisClient, type MatrixCell } from './client'

export default async function TopicAnalysisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]

  const [topicsRes, staffRes, recordsRes, cyclesRes, upcomingRes] = await Promise.all([
    supabase
      .from('topics')
      .select('id, name')
      .order('name'),
    supabase
      .from('staff')
      .select('id, first_name, last_name, display_first_name, display_last_name')
      .eq('active', true)
      .order('last_name'),
    supabase
      .from('training_records')
      .select(`
        staff_id, confirmed,
        courses!inner(
          topic_id, name, date, start_time, end_time,
          trainer_name,
          trainer_staff:trainer_staff_id(
            first_name, last_name, display_first_name, display_last_name
          )
        )
      `)
      .not('courses.topic_id', 'is', null),
    // Current active cycle for each staff member
    supabase
      .from('certification_cycles')
      .select('staff_id, end_date')
      .lte('start_date', today)
      .gte('end_date', today),
    // Upcoming trainings that have a topic assigned
    supabase
      .from('courses')
      .select(`
        id, name, date, start_time, end_time, topic_id,
        trainer_name,
        trainer_staff:trainer_staff_id(
          first_name, last_name, display_first_name, display_last_name
        )
      `)
      .not('topic_id', 'is', null)
      .gte('date', today)
      .order('date'),
  ])

  const topics   = topicsRes.data   ?? []
  const staff    = staffRes.data    ?? []
  const records  = recordsRes.data  ?? []
  const cycles   = cyclesRes.data   ?? []
  const upcoming = upcomingRes.data ?? []

  // Build a map of staff_id → cycle end_date (most recent active cycle)
  const cycleEndMap: Record<string, string> = {}
  for (const c of cycles) {
    // If multiple active cycles, keep the latest end_date
    if (!cycleEndMap[c.staff_id] || c.end_date > cycleEndMap[c.staff_id]) {
      cycleEndMap[c.staff_id] = c.end_date
    }
  }

  // ── Build matrix ───────────────────────────────────────────────────────────
  const matrix: Record<string, Record<string, MatrixCell>> = {}
  for (const s of staff) {
    matrix[s.id] = {}
    for (const t of topics) matrix[s.id][t.id] = { status: 'none' }
  }

  for (const r of records) {
    const course = r.courses as unknown as {
      topic_id: string | null
      name: string
      date: string | null
      start_time: string | null
      end_time: string | null
      trainer_name: string | null
      trainer_staff: {
        first_name: string; last_name: string
        display_first_name: string | null; display_last_name: string | null
      } | null
    }
    const topicId = course?.topic_id
    if (!topicId || !matrix[r.staff_id]) continue

    // Resolve trainer display name
    let trainer = '—'
    if (course.trainer_staff) {
      const ts = course.trainer_staff
      const first = ts.display_first_name?.trim() || ts.first_name
      const last  = ts.display_last_name?.trim()  || ts.last_name
      trainer = `${first} ${last}`
    } else if (course.trainer_name) {
      trainer = course.trainer_name
    }

    const trainingDetail = {
      name:       course.name,
      date:       course.date,
      start_time: course.start_time,
      end_time:   course.end_time,
      trainer,
    }

    const current = matrix[r.staff_id][topicId]
    // completed beats scheduled beats none; keep the most informative record
    if (r.confirmed && current.status !== 'completed') {
      matrix[r.staff_id][topicId] = { status: 'completed', training: trainingDetail }
    } else if (!r.confirmed && current.status === 'none') {
      matrix[r.staff_id][topicId] = { status: 'scheduled', training: trainingDetail }
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Topic Analysis</h1>
        <p className="mt-1 text-sm text-gray-500">
          Training completion by topic across all active staff
        </p>
      </div>

      <TopicAnalysisClient
        topics={topics}
        availableTrainings={upcoming.map(c => {
          const ts = (c.trainer_staff as unknown as {
            first_name: string; last_name: string
            display_first_name: string | null; display_last_name: string | null
          } | null)
          let trainer = c.trainer_name ?? '—'
          if (ts) {
            const first = ts.display_first_name?.trim() || ts.first_name
            const last  = ts.display_last_name?.trim()  || ts.last_name
            trainer = `${first} ${last}`
          }
          return {
            id:         c.id,
            topic_id:   c.topic_id as string,
            name:       c.name,
            date:       c.date,
            start_time: c.start_time,
            end_time:   c.end_time,
            trainer,
          }
        })}
        staff={staff.map(s => ({
          id:                 s.id,
          first_name:         s.first_name,
          last_name:          s.last_name,
          display_first_name: s.display_first_name ?? null,
          display_last_name:  s.display_last_name  ?? null,
          cycle_end_date:     cycleEndMap[s.id] ?? null,
        }))}
        matrix={matrix}
      />
    </div>
  )
}
