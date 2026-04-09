import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCompanyBilling, getAllPlans, getRBTCount, formatPrice } from '@/lib/plans'
import { getCompanyId } from '@/lib/get-company-id'
import { BillingClient } from './client'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const companyId = await getCompanyId()
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
      formatPrice={formatPrice}
    />
  )
}
