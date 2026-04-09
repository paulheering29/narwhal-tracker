import { createClient } from '@/lib/supabase/server'

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
  const supabase = await createClient()
  const { data } = await supabase
    .from('companies')
    .select('plan_id, stripe_customer_id, stripe_subscription_id, subscription_status, plan:plan_id(*)')
    .eq('id', companyId)
    .single()
  if (!data) return null
  return {
    plan_id: data.plan_id,
    stripe_customer_id: data.stripe_customer_id,
    stripe_subscription_id: data.stripe_subscription_id,
    subscription_status: data.subscription_status,
    plan: (data.plan as unknown as Plan) ?? null,
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
