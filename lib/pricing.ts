// Pricing and access rules. Pure (no Stripe, no database) so client components can import it.

// ─── Pricing ──────────────────────────────────────────────────────────────────
// One plan. These numbers are display-only: what is actually charged is the
// Stripe prices found by the lookup keys below, so change a price in Stripe
// (new price, same lookup key) and update these to match.

export const BASE_CENTS  = 5000   // per organization per month
export const USER_CENTS  = 50     // per active person per month
export const STATE_CENTS = 1000   // per state checked nightly, per month
export const TRIAL_DAYS  = 30

// Where "contact us for a discounted plan" goes.
export const CONTACT_EMAIL = 'hello@trainingloop.tech'

export const PRICE_LOOKUP = { base: 'trainingloop_base_monthly', user: 'trainingloop_user_monthly', state: 'trainingloop_state_monthly' } as const

export function monthlyTotalCents(users: number, states: number): number {
  return BASE_CENTS + users * USER_CENTS + states * STATE_CENTS
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

// ─── Access ───────────────────────────────────────────────────────────────────

export type AccessState = 'comped' | 'subscribed' | 'trial' | 'expired'

export type AccessRow = {
  access_type: string
  trial_ends_at: string
  stripe_subscription_id: string | null
  subscription_status: string
}

// Stripe retries a failed card for a while (past_due); keep people working meanwhile.
export const PAYING = new Set(['active', 'trialing', 'past_due'])

export function accessFor(row: AccessRow, now = new Date()): AccessState {
  if (row.access_type !== 'paid') return 'comped'
  if (row.stripe_subscription_id && PAYING.has(row.subscription_status)) return 'subscribed'
  return new Date(row.trial_ends_at) > now ? 'trial' : 'expired'
}

export const hasAccess = (row: AccessRow) => accessFor(row) !== 'expired'

export const ACCESS_COLUMNS = 'access_type, trial_ends_at, stripe_subscription_id, subscription_status'

