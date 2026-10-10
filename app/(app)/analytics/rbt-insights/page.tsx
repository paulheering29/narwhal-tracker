import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { RbtInsightsClient } from './client'

export default async function RbtInsightsPage() {
  await cookies() // ensure cookies are read server-side
  const supabase = await createClient()

  const byCredential = (code: string) => supabase
    .from('staff')
    .select('id, first_name, last_name, display_first_name, display_last_name, original_certification_date')
    .eq('active', true)
    .ilike('role', code)
    .not('original_certification_date', 'is', null)
    .order('original_certification_date', { ascending: true })

  const [{ data: rbts }, { data: bcbas }] = await Promise.all([byCredential('RBT'), byCredential('BCBA')])

  return <RbtInsightsClient rbts={rbts ?? []} bcbas={bcbas ?? []} today={new Date().toISOString().split('T')[0]} />
}
