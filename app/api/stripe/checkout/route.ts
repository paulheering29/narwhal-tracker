import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { countUsers, getPriceIds, getStripe, tierForCompany, type PricingTier } from '@/lib/billing'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: staff } = await service.from('staff').select('company_id, roles').eq('auth_id', user.id).single()
  if (!staff?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })
  if (!staff.roles?.includes('Account Owner')) {
    return NextResponse.json({ error: 'Only the Account Owner can manage billing.' }, { status: 403 })
  }

  const { data: company } = await service
    .from('companies')
    .select('id, name, stripe_customer_id, stripe_subscription_id, subscription_status, price_tier')
    .eq('id', staff.company_id)
    .single()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 400 })
  if (company.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(company.subscription_status)) {
    return NextResponse.json({ error: 'You already have a subscription. Use Manage billing to change it.' }, { status: 400 })
  }

  let tier: PricingTier
  let prices: Awaited<ReturnType<typeof getPriceIds>>
  try {
    // The tier is only claimed when payment succeeds (see the webhook); a company that
    // already has one, from an earlier subscription, keeps it.
    tier = (await tierForCompany(company.price_tier)).tier
    prices = await getPriceIds(tier)
  } catch (err) {
    console.error('stripe prices missing', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Billing is not set up yet. Please contact support.' }, { status: 500 })
  }

  const stripe = getStripe()
  let customerId = company.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: company.name,
      email: user.email,
      metadata: { company_id: company.id },
    })
    customerId = customer.id
    await service.from('companies').update({ stripe_customer_id: customerId }).eq('id', company.id)
  }

  const [users, { count: stateCount }] = await Promise.all([
    countUsers(company.id),
    service.from('company_license_states').select('jurisdiction_code', { count: 'exact', head: true }).eq('company_id', company.id),
  ])

  // Stripe rejects zero-quantity lines, so states are included only when chosen.
  // The subscription's quantities are kept current afterwards by syncSubscriptionQuantities.
  const line_items = [
    { price: prices.base, quantity: 1 },
    { price: prices.user, quantity: Math.max(1, users) },
    ...(stateCount ? [{ price: prices.state, quantity: stateCount }] : []),
  ]

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://trainingloop.tech'
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items,
    success_url: `${baseUrl}/admin/users?tab=account&success=true`,
    cancel_url:  `${baseUrl}/admin/users?tab=account`,
    metadata: { company_id: company.id, price_tier: String(tier.tier) },
    subscription_data: { metadata: { company_id: company.id, price_tier: String(tier.tier) } },
  })

  return NextResponse.json({ url: session.url })
}
