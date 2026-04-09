import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(_request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // ── Get company's Stripe customer ID ──────────────────────────────────────
  const { data: profile } = await service
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const { data: company } = await service
    .from('companies')
    .select('stripe_customer_id')
    .eq('id', profile?.company_id)
    .single()

  if (!company?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://narwhal-tracker-eight.vercel.app'
  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   company.stripe_customer_id,
    return_url: `${baseUrl}/billing`,
  })

  return NextResponse.json({ url: portalSession.url })
}
