// Idle sign-out, shared by the browser timer and the middleware.
//
// The browser writes the time of the last activity into a cookie; the
// middleware reads it on every request. A timer alone isn't enough: a closed
// tab or a sleeping laptop never fires it, and the Supabase session stays valid.

export const SESSION_TIMEOUT_OPTIONS = [15, 30, 60, 120] as const
export const DEFAULT_SESSION_TIMEOUT = 15

export const IDLE_COOKIE = 'tl_active'

export function isTimeoutOption(n: unknown): n is typeof SESSION_TIMEOUT_OPTIONS[number] {
  return SESSION_TIMEOUT_OPTIONS.some(o => o === n)
}

/** Cookie value is "<last activity ms>:<timeout minutes>". Returns null if missing or malformed. */
export function parseIdleCookie(value: string | undefined): { last: number; minutes: number } | null {
  if (!value) return null
  const [last, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(last) || !isTimeoutOption(minutes)) return null
  return { last, minutes }
}
