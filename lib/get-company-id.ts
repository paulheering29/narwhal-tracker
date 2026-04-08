import { createClient } from '@/lib/supabase/client'

/**
 * Returns the current user's company_id.
 * Reads from JWT app_metadata first (fast, no DB round-trip).
 * Falls back to a profiles query if app_metadata isn't populated yet
 * (e.g. first login before the JWT was refreshed after profile creation).
 */
export async function getCompanyId(): Promise<string | null> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Primary: JWT app_metadata (set by the on_profile_change trigger)
  const fromJwt = user.app_metadata?.company_id as string | undefined
  if (fromJwt) return fromJwt

  // Fallback: query profiles directly
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  return profile?.company_id ?? null
}
