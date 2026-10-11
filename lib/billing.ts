import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import {
  ACCESS_COLUMNS, INTRO_RATES, PAYING, accessFor, monthlyTotalCents, type AccessState, type Rates,
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
  /** The company's own tier once it pays; until then, whatever tier is open today. */
  rates: Rates
  /** Only while the price is still an offer with a deadline: when it ends and what comes after. */
  offerEndsOn: string | null
  nextRates: Rates | null
}

export async function getBillingSummary(companyId: string): Promise<BillingSummary | null> {
  // Service client: companies RLS doesn't expose billing columns. companyId is
  // always pre-validated by the caller.
  const service = createServiceClient()
  const [{ data: company }, users, { data: states }] = await Promise.all([
    service.from('companies').select(`${ACCESS_COLUMNS}, stripe_customer_id, price_tier`).eq('id', companyId).single(),
    countUsers(companyId),
    service.from('company_license_states').select('jurisdiction_code').eq('company_id', companyId),
  ])
  if (!company) return null
  const { tier, claimed, next } = await tierForCompany(company.price_tier)
  const open = !claimed && tier.endsOn != null

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
    monthlyCents: monthlyTotalCents(users, stateCodes.length, tier),
    rates: tier,
    offerEndsOn: open ? tier.endsOn : null,
    nextRates: open ? next : null,
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

// ─── Pricing tiers ────────────────────────────────────────────────────────────

export type PricingTier = Rates & {
  tier: number
  /** Last day (YYYY-MM-DD, US Eastern) this tier can be signed up for; null = no end date. */
  endsOn: string | null
  lookups: { base: string; user: string; state: string }
}

async function loadTiers(): Promise<PricingTier[]> {
  const { data } = await createServiceClient().from('pricing_tiers').select('*').order('tier')
  return (data ?? []).map(r => ({
    tier: r.tier, endsOn: r.ends_on,
    baseCents: r.base_cents, userCents: r.user_cents, stateCents: r.state_cents,
    lookups: { base: r.base_lookup, user: r.user_lookup, state: r.state_lookup },
  }))
}

// Deadlines are calendar dates; "by Oct 31" has to mean the same thing to everyone.
const todayEastern = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

/**
 * The tier a company pays under: its own once it has started paying, otherwise the
 * lowest-numbered tier whose end date hasn't passed (the last tier is the standing price).
 * `claimed` is false for the second case, i.e. the price is still only an offer, and
 * `next` is what the price becomes after this tier's end date.
 */
export async function tierForCompany(priceTier: number | null): Promise<{ tier: PricingTier; claimed: boolean; next: PricingTier | null }> {
  const tiers = await loadTiers()
  if (tiers.length === 0) throw new Error('pricing_tiers is empty')
  const own = priceTier == null ? undefined : tiers.find(t => t.tier === priceTier)
  if (own) return { tier: own, claimed: true, next: null }

  const today = todayEastern()
  const i = tiers.findIndex(t => t.endsOn == null || t.endsOn >= today)
  const open = i === -1 ? tiers.length - 1 : i
  return { tier: tiers[open], claimed: false, next: tiers[open + 1] ?? null }
}

/** What a visitor is offered today, for the marketing page. Falls back to the original prices if the table can't be read. */
export async function getCurrentOffer(): Promise<{ rates: Rates; endsOn: string | null; next: Rates | null }> {
  try {
    const { tier, next } = await tierForCompany(null)
    return { rates: tier, endsOn: tier.endsOn, next: tier.endsOn ? next : null }
  } catch {
    return { rates: INTRO_RATES, endsOn: null, next: null }
  }
}

// ─── Stripe ───────────────────────────────────────────────────────────────────

let client: Stripe | null = null
export function getStripe(): Stripe {
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY!))
}

type PriceIds = Record<'base' | 'user' | 'state', string>
const priceCache = new Map<number, PriceIds>()

/** A tier's three recurring prices, found by lookup key so no price IDs live in code or env. */
export async function getPriceIds(tier: PricingTier): Promise<PriceIds> {
  const cached = priceCache.get(tier.tier)
  if (cached) return cached
  const { data } = await getStripe().prices.list({ lookup_keys: Object.values(tier.lookups), active: true })
  const byKey = new Map(data.map(p => [p.lookup_key, p.id]))
  const ids = {} as PriceIds
  for (const name of ['base', 'user', 'state'] as const) {
    const id = byKey.get(tier.lookups[name])
    if (!id) throw new Error(`Stripe price with lookup key "${tier.lookups[name]}" was not found.`)
    ids[name] = id
  }
  priceCache.set(tier.tier, ids)
  return ids
}

/**
 * Make the subscription's per-person and per-state quantities match reality.
 * Safe to call any time and from anywhere; does nothing without a subscription.
 * Stripe prorates the difference onto the next invoice.
 */
export async function syncSubscriptionQuantities(companyId: string): Promise<void> {
  const service = createServiceClient()
  const { data: company } = await service.from('companies')
    .select('stripe_subscription_id, subscription_status, price_tier').eq('id', companyId).single()
  if (!company?.stripe_subscription_id || !PAYING.has(company.subscription_status)) return

  // A subscription is always on its own tier's prices; matching against another tier's
  // would look like a missing line and add a second one at the wrong rate.
  const { tier } = await tierForCompany(company.price_tier ?? 1)
  const [prices, users, { data: states }] = await Promise.all([
    getPriceIds(tier),
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
