import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { cookies } from 'next/headers'
import { Resend } from 'resend'

export async function POST(request: NextRequest) {
  // ── Verify caller is an admin ─────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Look up caller via staff (bypass RLS to avoid chicken-and-egg)
  const { data: caller } = await service
    .from('staff')
    .select('company_id, roles')
    .eq('auth_id', user.id)
    .single()

  if (!caller?.roles?.includes('Admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const { email, password, first_name, last_name, tier, roles, job_role } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  // ── Create auth user (no confirmation email) ───────────────────────────────
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,   // mark confirmed immediately — no email needed
  })

  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? 'Failed to create user.' }, { status: 400 })
  }

  // ── Create staff row linked to the new auth user ──────────────────────────
  const { error: staffError } = await service.from('staff').insert({
    company_id: caller.company_id,
    auth_id:    created.user.id,
    first_name: first_name || '',
    last_name:  last_name  || '',
    email,
    tier:       tier ?? 'rbt',
    roles:      roles ?? [],
    role:       job_role || (tier === 'rbt' ? 'RBT' : null),
    active:     true,
  })

  if (staffError) {
    // Roll back the auth user so we don't leave orphans
    await service.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: staffError.message }, { status: 400 })
  }

  // ── Send welcome email via Resend ──────────────────────────────────────────
  try {
    const resend   = new Resend(process.env.RESEND_API_KEY)
    const name     = first_name ? `${first_name}${last_name ? ' ' + last_name : ''}` : email
    const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://narwhal-tracker.vercel.app'

    await resend.emails.send({
      from:    'Narwhal Tracker <noreply@narwhaltracker.com>',
      to:      email,
      subject: 'Your Narwhal Tracker account is ready',
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
          <div style="background: #0A253D; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Narwhal Tracker</h1>
          </div>
          <div style="background: #f9fafb; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 16px;">Hi ${name},</p>
            <p style="margin: 0 0 16px;">
              An account has been created for you on <strong>Narwhal Tracker</strong>.
              Here are your login details:
            </p>
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 0 0 20px;">
              <p style="margin: 0 0 8px; font-size: 14px;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 0; font-size: 14px;"><strong>Temporary password:</strong> ${password}</p>
            </div>
            <a href="${appUrl}/login"
               style="display: inline-block; background: #0A253D; color: white; padding: 12px 24px;
                      border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Sign in to Narwhal Tracker
            </a>
            <p style="margin: 20px 0 0; color: #6b7280; font-size: 13px;">
              Please change your password after your first sign-in.
            </p>
          </div>
        </div>
      `,
    })
  } catch {
    // Welcome email failure is non-fatal — user was created successfully
  }

  return NextResponse.json({ success: true })
}
