import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runRenewalReminders } from '@/lib/renewal-reminders'

export const maxDuration = 60

// Called once a day by Vercel Cron (see vercel.json). Vercel sends
// `Authorization: Bearer <CRON_SECRET>`; anything else is refused, so the
// endpoint can't be triggered by hand.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const result = await runRenewalReminders(createServiceClient(), appUrl)
  return NextResponse.json(result)
}
