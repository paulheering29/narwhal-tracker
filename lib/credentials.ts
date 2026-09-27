import type { SupabaseClient } from '@supabase/supabase-js'

/** A row of the credential_types lookup table (see migration 019). */
export type Credential = {
  code: string            // 'RBT', 'BCBA', ... — matches staff.role
  unit_label: string      // 'PDU' / 'CEU', singular
  units_required: number  // per certification cycle
}

/**
 * The credential for a staff.role value, or null when the role isn't a
 * credential (e.g. 'Trainer'). Codes are matched case-insensitively because
 * older rows and CSV imports weren't consistent about 'RBT' vs 'rbt'.
 */
export async function getCredential(
  supabase: SupabaseClient,
  role: string | null | undefined,
): Promise<Credential | null> {
  if (!role) return null
  const { data } = await supabase
    .from('credential_types')
    .select('code, unit_label, units_required')
    .ilike('code', role)
    .maybeSingle()
  return data ? { ...data, units_required: Number(data.units_required) } : null
}
