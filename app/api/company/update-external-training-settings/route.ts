import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Save who may add their own outside trainings, and whether those need
 * review. Only Account Owners may call this.
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service
    .from('staff')
    .select('company_id, roles')
    .eq('auth_id', user.id)
    .single()

  if (!me?.roles?.includes('Account Owner')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { allowed_credentials, review_required } = await request.json()
  if (!Array.isArray(allowed_credentials) || typeof review_required !== 'boolean') {
    return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
  }

  // Only real credential codes, so a typo can't silently lock everyone out.
  const { data: types } = await service.from('credential_types').select('code')
  const known = new Set((types ?? []).map(t => t.code))
  const allowed = allowed_credentials.filter((c: unknown): c is string => typeof c === 'string' && known.has(c))

  const { error } = await service
    .from('companies')
    .update({ external_training_credentials: allowed, external_training_review: review_required })
    .eq('id', me.company_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
