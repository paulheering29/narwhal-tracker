import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { RbtTimelineClient } from './client'

export default async function RbtTimelinePage() {
  await cookies()
  const supabase = await createClient()

  const { data: staff } = await supabase
    .from('staff')
    .select('id, first_name, last_name, display_first_name, display_last_name, original_certification_date')
    .eq('role', 'RBT')
    .not('original_certification_date', 'is', null)
    .order('original_certification_date', { ascending: true })

  return <RbtTimelineClient staff={staff ?? []} />
}
