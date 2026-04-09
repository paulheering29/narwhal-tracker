import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = {
  id: string
  name: 'free' | 'starter' | 'pro'
  display_name: string
  max_rbts: number
  allows_email: boolean
  storage_gb: number
  price_monthly: number        // cents
  stripe_price_id: string | null
  sort_order: number
}

export type CompanyBilling = {
  plan_id: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string
  plan: Plan | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** All plans, ordered for display */
export async function getAllPlans(): Promise<Plan[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('plans')
    .select('*')
    .eq('active', true)
    .order('sort_order')
  return (data ?? []) as Plan[]
}

/** The plan for a specific company */
export async function getCompanyBilling(companyId: string): Promise<CompanyBilling | null> {
  // Use service client — companies table RLS doesn't expose billing columns
  // to the anon client; companyId is always pre-validated by the caller.
  const service = createServiceClient()

  const { data: company } = await service
    .from('companies')
    .select('plan_id, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', companyId)
    .single()
  if (!company) return null

  let plan: Plan | null = null
  if (company.plan_id) {
    const { data: planData } = await service
      .from('plans')
      .select('*')
      .eq('id', company.plan_id)
      .single()
    plan = (planData as Plan) ?? null
  }

  return {
    plan_id:                company.plan_id,
    stripe_customer_id:     company.stripe_customer_id,
    stripe_subscription_id: company.stripe_subscription_id,
    subscription_status:    company.subscription_status,
    plan,
  }
}

/** Number of active RBTs for a company */
export async function getRBTCount(companyId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('active', true)
    .ilike('role', 'RBT')
  return count ?? 0
}

/** Can this company add another RBT? */
export async function canAddRBT(companyId: string): Promise<{
  allowed: boolean
  current: number
  max: number
  planName: string
}> {
  const [billing, count] = await Promise.all([
    getCompanyBilling(companyId),
    getRBTCount(companyId),
  ])
  const max      = billing?.plan?.max_rbts ?? 5
  const planName = billing?.plan?.display_name ?? 'Free'
  return { allowed: count < max, current: count, max, planName }
}

/** Does this company's plan include email? */
export async function canUseEmail(companyId: string): Promise<boolean> {
  const billing = await getCompanyBilling(companyId)
  return billing?.plan?.allows_email ?? false
}

/** Does this company's plan include file storage? */
export async function canUseStorage(companyId: string): Promise<boolean> {
  const billing = await getCompanyBilling(companyId)
  return (billing?.plan?.storage_gb ?? 0) > 0
}

/** Format cents as a dollar string */
export function formatPrice(cents: number): string {
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(0)}/mo`
}
