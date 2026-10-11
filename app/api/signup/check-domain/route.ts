import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { emailDomain, isFreeEmailDomain } from '@/lib/email-domains'

// Does an organization already use Training Loop with an admin or owner on this
// email domain? Answers yes/no only (no names, no counts) so it can't be used to
// list anyone. Personal mail providers always answer no.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const domain = typeof body?.email === 'string' ? emailDomain(body.email) : null
  if (!domain || isFreeEmailDomain(domain)) return NextResponse.json({ exists: false })

  const service = createServiceClient()
  const { count } = await service
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
    .not('auth_id', 'is', null)
    .overlaps('roles', ['Admin', 'Account Owner'])
    .ilike('email', `%@${domain}`)

  return NextResponse.json({ exists: (count ?? 0) > 0 })
}
