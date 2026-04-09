import { createServiceClient } from '@/lib/supabase/service'
import { OwnerClient } from './client'

export default async function OwnerPage() {
  const service = createServiceClient()

  const [plansRes, companiesRes] = await Promise.all([
    service.from('plans').select('*').order('sort_order'),
    service
      .from('companies')
      .select('id, name, created_at, subscription_status, plan:plan_id(id, name, display_name), stripe_customer_id, stripe_subscription_id')
      .order('created_at', { ascending: false }),
  ])

  return (
    <OwnerClient
      initialPlans={plansRes.data ?? []}
      initialCompanies={companiesRes.data ?? []}
    />
  )
}
