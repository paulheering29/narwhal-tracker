import { createHmac } from 'crypto'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL_LIMIT = 3     // emails to one address…
const IP_LIMIT    = 10    // …and requests from one IP…
const WINDOW      = '1 hour'   // …per hour

const hash = (value: string) =>
  createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').update(value).digest('hex')

/**
 * Throttle endpoints that email an arbitrary address (signup, password reset).
 *   'ok'            — go ahead (this request is now counted)
 *   'email_limited' — that address already got its share; skip the send but
 *                     answer as if it worked, so the endpoint reveals nothing
 *   'ip_limited'    — too many requests from this IP; answer 429
 * If the limiter itself fails we let the request through: a database hiccup
 * shouldn't lock people out of resetting a password.
 */
export async function checkEmailRequest(
  service: SupabaseClient,
  request: NextRequest,
  kind: 'signup' | 'password-reset',
  email: string,
): Promise<'ok' | 'email_limited' | 'ip_limited'> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip')
  const { data, error } = await service.rpc('record_email_request', {
    p_kind: kind,
    p_email_hash: hash(email.trim().toLowerCase()),
    p_ip_hash: ip ? hash(ip) : null,   // no IP to go on: don't lump everyone into one bucket
    p_email_limit: EMAIL_LIMIT,
    p_ip_limit: IP_LIMIT,
    p_window: WINDOW,
  })
  if (error) return 'ok'
  return data === 'email_limited' || data === 'ip_limited' ? data : 'ok'
}
