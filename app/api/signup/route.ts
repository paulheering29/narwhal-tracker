import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import { EMAIL_FROM } from '@/lib/email'
import { emailDomain } from '@/lib/email-domains'

const MIN_PASSWORD = 10
// A person can't fill this in faster than this; a script usually can.
const MIN_FILL_MS = 2500

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Start a signup. Creates the login (unconfirmed) and emails a confirmation
 * link; the organization itself is only created when the link is clicked (see
 * /auth/confirm), so abandoned signups leave nothing behind but an unconfirmed
 * login.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  // Bot checks: a hidden field only a script fills in, and implausibly fast submits.
  // Answer like a success so the script learns nothing.
  if (body.website || (typeof body.elapsedMs === 'number' && body.elapsedMs < MIN_FILL_MS)) {
    return NextResponse.json({ success: true })
  }

  const organization = String(body.organization ?? '').trim()
  const firstName    = String(body.firstName ?? '').trim()
  const lastName     = String(body.lastName ?? '').trim()
  const email        = String(body.email ?? '').trim().toLowerCase()
  const password     = String(body.password ?? '')

  if (organization.length < 2 || organization.length > 100) return NextResponse.json({ error: 'Enter your organization’s name.' }, { status: 400 })
  if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60) return NextResponse.json({ error: 'Enter your first and last name.' }, { status: 400 })
  if (!emailDomain(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (password.length < MIN_PASSWORD) return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { data: { signup_company: organization, first_name: firstName, last_name: lastName } },
  })

  if (error || !data?.user || !data.properties?.hashed_token) {
    // Someone already has this email. Answer like a success so the form can't be
    // used to find out who has an account.
    if (error?.code === 'email_exists' || /already (been )?registered/i.test(error?.message ?? '')) {
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: 'We couldn’t create your account. Please try again.' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const link = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=signup`

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: sendError } = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Confirm your Training Loop account',
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
          <div style="background: #025CA8; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Training Loop</h1>
          </div>
          <div style="background: #f9fafb; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 16px;">Hi ${escapeHtml(firstName)},</p>
            <p style="margin: 0 0 20px;">
              Confirm your email to finish setting up <strong>${escapeHtml(organization)}</strong> on Training Loop.
            </p>
            <a href="${link}"
               style="display: inline-block; background: #025CA8; color: white; padding: 12px 24px;
                      border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Confirm my email
            </a>
            <p style="margin: 20px 0 0; color: #6b7280; font-size: 13px;">
              If you didn’t sign up, you can ignore this email.
            </p>
          </div>
        </div>
      `,
    })
    if (sendError) throw sendError
  } catch (err) {
    // Resend's reason (unverified domain, bad key, bad sender) is what's needed to
    // fix this; it contains no recipient or password data.
    const reason = err as { name?: string; message?: string; statusCode?: number }
    console.error('signup confirmation email failed', reason.statusCode ?? '', reason.name ?? '', reason.message ?? '')
    // Remove the login so they can simply try again.
    await service.auth.admin.deleteUser(data.user.id)
    return NextResponse.json({ error: 'We couldn’t send the confirmation email. Please try again in a moment.' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
