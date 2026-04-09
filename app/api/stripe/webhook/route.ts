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
      const planId    = session.metadata?.plan_id
      if (!companyId || !planId) break

      await service.from('companies').update({
        plan_id:                 planId,
        stripe_customer_id:      session.customer as string,
        stripe_subscription_id:  session.subscription as string,
        subscription_status:     'active',
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
      // Subscription cancelled — revert to free plan
      const sub = event.data.object as Stripe.Subscription
      const { data: company } = await service
        .from('companies')
        .select('id')
        .eq('stripe_subscription_id', sub.id)
        .single()
      if (!company) break

      const { data: freePlan } = await service
        .from('plans')
        .select('id')
        .eq('name', 'free')
        .single()

      await service.from('companies').update({
        plan_id:                freePlan?.id ?? null,
        stripe_subscription_id: null,
        subscription_status:    'canceled',
      }).eq('id', company.id)
      break
    }
  }

  return NextResponse.json({ received: true })
}
