import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// The bare domain and www serve only the marketing page; the app itself lives
// on the host in NEXT_PUBLIC_APP_URL (login.trainingloop.tech) so everyone
// signs in on one origin and gets one session cookie.
const MARKETING_HOSTS = ['trainingloop.tech', 'www.trainingloop.tech']

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host   = request.headers.get('host') ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (MARKETING_HOSTS.includes(host)) {
    if (pathname === '/') return NextResponse.next()
    // API routes stay put: a redirect would break POSTs like the Stripe webhook.
    // The host check prevents a redirect loop while the app URL is still www.
    if (appUrl && !pathname.startsWith('/api/') && new URL(appUrl).host !== host) {
      return NextResponse.redirect(new URL(pathname + search, appUrl))
    }
  } else if (pathname === '/' && process.env.NODE_ENV !== 'development') {
    // On the app host, the root is the sign-in page (which forwards signed-in
    // users to their dashboard). Local dev keeps "/" so the landing page can be previewed.
    return NextResponse.redirect(new URL('/login', request.url))
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
                     || pathname === '/forgot-password'
                     || pathname === '/reset-password'
  const isHomePage    = pathname === '/'
  const isStripeHook  = pathname === '/api/stripe/webhook'

  // Always allow the public landing page and Stripe webhook through
  if (isHomePage || isStripeHook) return supabaseResponse

  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
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
