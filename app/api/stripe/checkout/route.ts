import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { planName } = await request.json()
  if (!planName) return NextResponse.json({ error: 'planName is required' }, { status: 400 })

  const service = createServiceClient()

  // ── Get profile → company ─────────────────────────────────────────────────
  const { data: profile } = await service
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })

  // ── Get plan + Stripe price ───────────────────────────────────────────────
  const { data: plan } = await service
    .from('plans')
    .select('id, stripe_price_id, display_name')
    .eq('name', planName)
    .single()
  if (!plan?.stripe_price_id) {
    return NextResponse.json({ error: 'This plan is not yet available for purchase. Please contact support.' }, { status: 400 })
  }

  // ── Get or create Stripe customer ─────────────────────────────────────────
  const { data: company } = await service
    .from('companies')
    .select('id, name, stripe_customer_id')
    .eq('id', profile.company_id)
    .single()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 400 })

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

  // ── Create Checkout Session ───────────────────────────────────────────────
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://narwhal-tracker-eight.vercel.app'
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${baseUrl}/billing?success=true`,
    cancel_url:  `${baseUrl}/billing`,
    metadata: { company_id: company.id, plan_id: plan.id },
  })

  return NextResponse.json({ url: session.url })
}
