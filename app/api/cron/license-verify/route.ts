import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runLicenseVerification } from '@/lib/license-check/run'

export const maxDuration = 300

// Called once a night by Vercel Cron (see vercel.json). Same guard as the
// renewal-reminders job: Vercel sends `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await runLicenseVerification(createServiceClient()))
}
