import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { IDLE_COOKIE, parseIdleCookie } from '@/lib/idle'

// The bare domain and www serve only the marketing page; the app itself lives
// on the host in NEXT_PUBLIC_APP_URL (app.trainingloop.tech) so everyone
// signs in on one origin and gets one session cookie.
const MARKETING_HOSTS = ['trainingloop.tech', 'www.trainingloop.tech']

// Temporary gate on the marketing page while it isn't ready for the public.
// Active only while MARKETING_PASSWORD is set; delete the variable to open the page.
// Any username works; the browser's own sign-in prompt asks for it.
function marketingGate(request: NextRequest): NextResponse | null {
  const password = process.env.MARKETING_PASSWORD
  if (!password) return null
  const header = request.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    try {
      const given = atob(header.slice(6)).split(':').slice(1).join(':')
      if (given === password) return null
    } catch { /* malformed header: fall through to the prompt */ }
  }
  return new NextResponse('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Training Loop", charset="UTF-8"' },
  })
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host   = request.headers.get('host') ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (MARKETING_HOSTS.includes(host)) {
    if (pathname === '/') return marketingGate(request) ?? NextResponse.next()
    // API routes stay put: a redirect would break POSTs like the Stripe webhook.
    // The host check prevents a redirect loop while the app URL is still www.
    if (appUrl && !pathname.startsWith('/api/') && new URL(appUrl).host !== host) {
      return NextResponse.redirect(new URL(pathname + search, appUrl))
    }
  } else if (pathname === '/' && process.env.NODE_ENV !== 'development') {
    // On the app host, the root is the sign-in page (which forwards signed-in
    // users to their dashboard). Local dev keeps "/" so the landing page can be previewed.
    return NextResponse.redirect(new URL('/login', request.url))
  } else if (pathname === '/') {
    const blocked = marketingGate(request)
    if (blocked) return blocked
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — required for Server Components to pick up token refresh
  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage    = pathname === '/login'
                     || pathname === '/signup' || pathname.startsWith('/signup/')
                     || pathname === '/forgot-password'
                     || pathname === '/reset-password'
  const isHomePage    = pathname === '/'
  const isStripeHook  = pathname === '/api/stripe/webhook'
  // Signup / password-reset endpoints and the emailed link are used before anyone has a session.
  const isSignupFlow  = pathname.startsWith('/api/signup') || pathname === '/auth/confirm'
                     || pathname === '/api/auth/forgot-password'
                     || pathname.startsWith('/api/cron/')

  // Always allow the public landing page, Stripe webhook and signup flow through
  if (isHomePage || isStripeHook || isSignupFlow) return supabaseResponse

  // Idle too long (closed tab, sleeping laptop): end the session here, since no browser timer ran.
  const idle = parseIdleCookie(request.cookies.get(IDLE_COOKIE)?.value)
  if (user && idle && Date.now() - idle.last >= idle.minutes * 60_000) {
    await supabase.auth.signOut({ scope: 'local' })   // local: don't sign out the person's other devices
    const expired = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Session expired' }, { status: 401 })
      : NextResponse.redirect(new URL('/login?notice=idle', request.url))
    supabaseResponse.cookies.getAll().forEach(c => expired.cookies.set(c))   // carries the cleared auth cookies
    expired.cookies.delete(IDLE_COOKIE)
    return expired
  }

  // Signed out: drop the activity stamp so the next sign-in doesn't inherit an old one.
  if (!user && request.cookies.has(IDLE_COOKIE)) supabaseResponse.cookies.delete(IDLE_COOKIE)

  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirect = NextResponse.redirect(url)
    redirect.cookies.delete(IDLE_COOKIE)
    return redirect
  }

  // A reset link signs the person in first, then lands them on /reset-password.
  if (user && isAuthPage && pathname !== '/reset-password') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
