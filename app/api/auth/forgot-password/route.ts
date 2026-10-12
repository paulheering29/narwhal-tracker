import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import { EMAIL_FROM } from '@/lib/email'
import { emailDomain } from '@/lib/email-domains'
import { checkEmailRequest } from '@/lib/rate-limit'

/**
 * Send a password-reset link through Resend (same sender as everything else).
 * The link goes to /auth/confirm, which signs the person in with a one-time
 * token and forwards them to /reset-password — so it works from any browser or
 * device, unlike a code tied to the browser that asked for it.
 *
 * Always answers the same way whether or not the email has an account, so it
 * can't be used to find out who does.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email ?? '').trim().toLowerCase()
  if (!emailDomain(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const service = createServiceClient()

  // Limit how many reset emails one address (or one IP) can trigger. An address
  // that's had its share still gets the normal "check your email" answer.
  const limit = await checkEmailRequest(service, request, 'password-reset', email)
  if (limit === 'ip_limited') {
    return NextResponse.json({ error: 'Too many requests. Please try again in a little while.' }, { status: 429 })
  }
  if (limit === 'email_limited') return NextResponse.json({ success: true })

  const { data, error } = await service.auth.admin.generateLink({ type: 'recovery', email })
  // Unknown addresses fail here too, and must still look like success -- but a real outage shouldn't be silent.
  if (error) console.error('password reset link failed', error.status ?? '', error.code ?? '', error.message)

  if (!error && data?.properties?.hashed_token) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
    const link = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendError } = await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: 'Reset your Training Loop password',
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
            <div style="background: #025CA8; padding: 24px 32px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 20px;">Training Loop</h1>
            </div>
            <div style="background: #f9fafb; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 16px;">We got a request to reset your password.</p>
              <a href="${link}"
                 style="display: inline-block; background: #025CA8; color: white; padding: 12px 24px;
                        border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
                Choose a new password
              </a>
              <p style="margin: 20px 0 0; color: #6b7280; font-size: 13px;">
                The link works once and expires in an hour. If you didn’t ask for this, you can ignore this email.
              </p>
            </div>
          </div>
        `,
      })
      if (sendError) throw sendError
    } catch (err) {
      const reason = err as { name?: string; message?: string; statusCode?: number }
      console.error('password reset email failed', reason.statusCode ?? '', reason.name ?? '', reason.message ?? '')
      return NextResponse.json({ error: 'We couldn’t send the email. Please try again in a moment.' }, { status: 502 })
    }
  }

  return NextResponse.json({ success: true })
}
