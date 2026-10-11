import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runLicenseVerification } from '@/lib/license-check/run'
import { syncQuietly } from '@/lib/billing'

export const maxDuration = 300

// Called once a night by Vercel Cron (see vercel.json). Same guard as the
// renewal-reminders job: Vercel sends `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const db = createServiceClient()
  const result = await runLicenseVerification(db, appUrl)

  // Same nightly pass: catch any headcount change that didn't sync when it happened
  // (a bulk import, an edit made straight in the database) so invoices stay accurate.
  const { data: subscribed } = await db.from('companies').select('id').not('stripe_subscription_id', 'is', null)
  for (const c of subscribed ?? []) await syncQuietly(c.id as string)

  return NextResponse.json({ ...result, billingSynced: subscribed?.length ?? 0 })
}
