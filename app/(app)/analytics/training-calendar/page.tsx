import { createClient } from '@/lib/supabase/server'
import { TrainingCalendarClient } from './client'

export default async function TrainingCalendarPage({
  searchParams,
}: {
  searchParams: { year?: string }
}) {
  const supabase = await createClient()
  const year = parseInt(searchParams.year ?? new Date().getFullYear().toString())

  const { data: courses } = await supabase
    .from('courses')
    .select(`
      id, name, date, start_time, end_time, modality, units,
      training_records(
        id, confirmed,
        staff:staff_id(id, first_name, last_name, display_first_name, display_last_name)
      )
    `)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .not('date', 'is', null)
    .order('date')

  return (
    <TrainingCalendarClient
      rawCourses={(courses ?? []) as unknown as RawCourse[]}
      year={year}
    />
  )
}

// Exported so the client can import the type
export type RawCourse = {
  id: string
  name: string
  date: string
  start_time: string | null
  end_time: string | null
  modality: string | null
  units: number | null
  training_records: {
    id: string
    confirmed: boolean
    staff: {
      id: string
      first_name: string
      last_name: string
      display_first_name: string | null
      display_last_name: string | null
    } | {
      id: string
      first_name: string
      last_name: string
      display_first_name: string | null
      display_last_name: string | null
    }[] | null
  }[]
}
