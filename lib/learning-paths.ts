import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageTrainings } from '@/lib/permissions'

/**
 * Gate for the learning-path API routes: signed in, staff tier, and allowed to
 * manage trainings. Returns the service client (the routes call SQL functions
 * that only the service role may execute) plus the caller's company.
 */
export async function requirePathManager(pathId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const

  const service = createServiceClient()
  const { data: me } = await service
    .from('staff')
    .select('company_id, tier, roles')
    .eq('auth_id', user.id)
    .single()
  if (!me || me.tier !== 'staff' || !canManageTrainings(me.roles ?? [])) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const
  }

  const { data: path } = await service
    .from('learning_paths')
    .select('id, company_id, archived_at')
    .eq('id', pathId)
    .single()
  if (!path || path.company_id !== me.company_id) {
    return { error: NextResponse.json({ error: 'Learning path not found.' }, { status: 404 }) } as const
  }

  return { service, userId: user.id, companyId: me.company_id as string, path } as const
}
