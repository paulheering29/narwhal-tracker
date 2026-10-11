import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Landing point for the signup confirmation email: confirms the address, creates
 * the organization (provision_company_owner is idempotent, so a second click is
 * harmless), refreshes the session so it carries the new organization claims,
 * and sends them to the getting-started page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const fail = () => NextResponse.redirect(`${origin}/login?notice=confirm-failed`)
  if (!tokenHash || searchParams.get('type') !== 'signup') return fail()

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ type: 'signup', token_hash: tokenHash })
  if (error || !data.user) return fail()

  const meta = (data.user.user_metadata ?? {}) as Record<string, string | undefined>
  const service = createServiceClient()
  const { error: provisionError } = await service.rpc('provision_company_owner', {
    p_auth_id:      data.user.id,
    p_email:        data.user.email ?? '',
    p_first_name:   meta.first_name ?? '',
    p_last_name:    meta.last_name ?? '',
    p_company_name: meta.signup_company ?? '',
  })
  if (provisionError) {
    await supabase.auth.signOut()
    return fail()
  }

  // The session was issued before the organization existed; mint a new one so
  // its claims (company, tier, roles) are in place from the first page.
  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?notice=confirmed`)
  }
  return NextResponse.redirect(`${origin}/welcome`)
}
