// Pricing and access rules. Pure (no Stripe, no database) so client components can import it.

// ─── Pricing ──────────────────────────────────────────────────────────────────
// Prices live in the pricing_tiers table (migration 037) and in Stripe, one set of
// three prices per tier. A company keeps the tier it started paying under.
// INTRO_RATES is only the fallback shown if the table can't be read.

export type Rates = { baseCents: number; userCents: number; stateCents: number }

export const INTRO_RATES: Rates = { baseCents: 5000, userCents: 50, stateCents: 1000 }
export const TRIAL_DAYS = 30

// Where "contact us for a discounted plan" goes.
export const CONTACT_EMAIL = 'hello@trainingloop.tech'

export function monthlyTotalCents(users: number, states: number, rates: Rates = INTRO_RATES): number {
  return rates.baseCents + users * rates.userCents + states * rates.stateCents
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

/** 'YYYY-MM-DD' -> 'October 31'. Parsed as UTC so the day never shifts with the viewer's timezone. */
export function formatDeadline(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** The "subscribe before it goes up" sentence, shared by the marketing page and the billing tab. */
export function lockInLine(endsOn: string, next: Rates | null): string {
  const after = next ? ` After that it's ${formatMoney(next.baseCents)} a month plus ${formatMoney(next.userCents)} per person.` : ''
  return `Subscribe by ${formatDeadline(endsOn)} and keep this rate for as long as you stay.${after}`
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

