import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { RbtInsightsClient } from './client'

export default async function RbtInsightsPage() {
  await cookies() // ensure cookies are read server-side
  const supabase = await createClient()

  const { data: staff } = await supabase
    .from('staff')
    .select('id, first_name, last_name, display_first_name, display_last_name, original_certification_date')
    .eq('active', true)
    .ilike('role', 'RBT')
    .not('original_certification_date', 'is', null)
    .order('original_certification_date', { ascending: true })

  return <RbtInsightsClient staff={staff ?? []} today={new Date().toISOString().split('T')[0]} />
}
