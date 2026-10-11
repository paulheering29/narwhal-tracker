import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  const body      = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) return NextResponse.json({ error: 'No signature' }, { status: 400 })

  // ── Verify webhook signature ───────────────────────────────────────────────
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const service = createServiceClient()

  // ── Handle events ──────────────────────────────────────────────────────────
  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription') break

      const companyId = session.metadata?.company_id
      if (!companyId) break

      // The tier the checkout was priced at is claimed now that payment succeeded.
      const priceTier = Number(session.metadata?.price_tier)
      await service.from('companies').update({
        stripe_customer_id:      session.customer as string,
        stripe_subscription_id:  session.subscription as string,
        subscription_status:     'active',
        ...(priceTier ? { price_tier: priceTier } : {}),
      }).eq('id', companyId)
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const { data: company } = await service
        .from('companies')
        .select('id')
        .eq('stripe_subscription_id', sub.id)
        .single()
      if (!company) break

      await service.from('companies').update({
        subscription_status: sub.status,
      }).eq('id', company.id)
      break
    }

    case 'customer.subscription.deleted': {
      // Subscription cancelled. Access then falls back to whatever is left of the
      // trial (usually none) -- see accessFor in lib/pricing.ts.
      const sub = event.data.object as Stripe.Subscription
      await service.from('companies').update({
        stripe_subscription_id: null,
        subscription_status:    'canceled',
      }).eq('stripe_subscription_id', sub.id)
      break
    }
  }

  return NextResponse.json({ received: true })
}
