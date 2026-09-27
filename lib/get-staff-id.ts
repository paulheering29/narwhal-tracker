import { createClient } from '@/lib/supabase/client'

/**
 * Returns the current user's own staff.id.
 * Reads from JWT app_metadata first (fast, no DB round-trip).
 * Falls back to a staff query if app_metadata isn't populated yet
 * (e.g. first login before the JWT was refreshed).
 */
export async function getStaffId(): Promise<string | null> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Primary: JWT app_metadata (set by the on_staff_auth_sync trigger)
  const fromJwt = user.app_metadata?.staff_id as string | undefined
  if (fromJwt) return fromJwt

  // Fallback: query staff directly via auth_id
  const { data: staff } = await supabase
    .from('staff')
    .select('id')
    .eq('auth_id', user.id)
    .single()

  return staff?.id ?? null
}
