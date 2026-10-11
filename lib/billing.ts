import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import {
  ACCESS_COLUMNS, PAYING, PRICE_LOOKUP, accessFor, monthlyTotalCents, type AccessState,
} from '@/lib/pricing'

// ─── Summary for the billing screens ─────────────────────────────────────────

export type BillingSummary = {
  access: AccessState
  trialEndsAt: string
  daysLeft: number
  subscriptionStatus: string
  hasCustomer: boolean
  hasSubscription: boolean
  users: number
  states: string[]
  monthlyCents: number
}

export async function getBillingSummary(companyId: string): Promise<BillingSummary | null> {
  // Service client: companies RLS doesn't expose billing columns. companyId is
  // always pre-validated by the caller.
  const service = createServiceClient()
  const [{ data: company }, users, { data: states }] = await Promise.all([
    service.from('companies').select(`${ACCESS_COLUMNS}, stripe_customer_id`).eq('id', companyId).single(),
    countUsers(companyId),
    service.from('company_license_states').select('jurisdiction_code').eq('company_id', companyId),
  ])
  if (!company) return null

  const stateCodes = (states ?? []).map(s => s.jurisdiction_code as string)
  return {
    access: accessFor(company),
    trialEndsAt: company.trial_ends_at,
    daysLeft: Math.max(0, Math.ceil((new Date(company.trial_ends_at).getTime() - Date.now()) / 86_400_000)),
    subscriptionStatus: company.subscription_status,
    hasCustomer: !!company.stripe_customer_id,
    hasSubscription: !!company.stripe_subscription_id,
    users,
    states: stateCodes,
    monthlyCents: monthlyTotalCents(users, stateCodes.length),
  }
}

/** Everyone who is active in the organization, whatever their role. This is what the per-person price counts. */
export async function countUsers(companyId: string): Promise<number> {
  const { count } = await createServiceClient()
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('active', true)
  return count ?? 0
}

// ─── Stripe ───────────────────────────────────────────────────────────────────

let client: Stripe | null = null
export function getStripe(): Stripe {
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY!))
}

type PriceIds = Record<keyof typeof PRICE_LOOKUP, string>
let priceCache: PriceIds | null = null

/** The three recurring prices, found by lookup key so no price IDs live in code or env. */
export async function getPriceIds(): Promise<PriceIds> {
  if (priceCache) return priceCache
  const { data } = await getStripe().prices.list({ lookup_keys: Object.values(PRICE_LOOKUP), active: true })
  const byKey = new Map(data.map(p => [p.lookup_key, p.id]))
  const ids = {} as PriceIds
  for (const [name, key] of Object.entries(PRICE_LOOKUP) as [keyof typeof PRICE_LOOKUP, string][]) {
    const id = byKey.get(key)
    if (!id) throw new Error(`Stripe price with lookup key "${key}" was not found.`)
    ids[name] = id
  }
  return (priceCache = ids)
}

/**
 * Make the subscription's per-person and per-state quantities match reality.
 * Safe to call any time and from anywhere; does nothing without a subscription.
 * Stripe prorates the difference onto the next invoice.
 */
export async function syncSubscriptionQuantities(companyId: string): Promise<void> {
  const service = createServiceClient()
  const { data: company } = await service.from('companies')
    .select('stripe_subscription_id, subscription_status').eq('id', companyId).single()
  if (!company?.stripe_subscription_id || !PAYING.has(company.subscription_status)) return

  const [prices, users, { data: states }] = await Promise.all([
    getPriceIds(),
    countUsers(companyId),
    service.from('company_license_states').select('jurisdiction_code').eq('company_id', companyId),
  ])
  const want: Record<'user' | 'state', number> = { user: Math.max(1, users), state: states?.length ?? 0 }

  const sub = await getStripe().subscriptions.retrieve(company.stripe_subscription_id)
  for (const kind of ['user', 'state'] as const) {
    const item = sub.items.data.find(i => i.price.id === prices[kind])
    const proration_behavior = 'create_prorations' as const
    if (item && want[kind] === 0) {
      await getStripe().subscriptionItems.del(item.id, { proration_behavior })
    } else if (item && item.quantity !== want[kind]) {
      await getStripe().subscriptionItems.update(item.id, { quantity: want[kind], proration_behavior })
    } else if (!item && want[kind] > 0) {
      await getStripe().subscriptionItems.create({ subscription: sub.id, price: prices[kind], quantity: want[kind], proration_behavior })
    }
  }
}

/** Best-effort wrapper for places where a Stripe hiccup must not fail the user's action. */
export async function syncQuietly(companyId: string): Promise<void> {
  try {
    await syncSubscriptionQuantities(companyId)
  } catch (err) {
    console.error('billing sync failed', companyId, err instanceof Error ? err.message : err)
  }
}
