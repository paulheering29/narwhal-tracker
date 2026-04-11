import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCompanyBilling, getAllPlans, getRBTCount } from '@/lib/plans'
import { BillingClient } from './client'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: staff } = await supabase
    .from('staff')
    .select('company_id')
    .eq('auth_id', user.id)
    .single()

  const companyId = staff?.company_id
  if (!companyId) redirect('/login')

  const [billing, allPlans, rbtCount] = await Promise.all([
    getCompanyBilling(companyId),
    getAllPlans(),
    getRBTCount(companyId),
  ])

  return (
    <BillingClient
      billing={billing}
      allPlans={allPlans}
      rbtCount={rbtCount}
    />
  )
}
