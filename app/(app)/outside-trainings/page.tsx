import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageTrainings } from '@/lib/permissions'
import { OUTSIDE_TRAINING_COLUMNS, toOutsideTraining } from '@/lib/outside-trainings'
import { ReviewQueueClient, type QueueRow } from './client'

// The team's queue for outside trainings people added themselves.
export default async function OutsideTrainingsReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('staff')
    .select('id, tier, roles')
    .eq('auth_id', user.id)
    .single()
  if (!me || me.tier !== 'staff' || !canManageTrainings(me.roles ?? [])) redirect('/dashboard')

  const [{ data: rows }, { data: types }] = await Promise.all([
    supabase
      .from('external_trainings')
      .select(`${OUTSIDE_TRAINING_COLUMNS}, created_at, staff:staff_id(id, role, first_name, last_name, display_first_name, display_last_name)`)
      .order('created_at', { ascending: false }),
    supabase.from('credential_types').select('code, unit_label'),
  ])

  const unitByCode = new Map((types ?? []).map(t => [t.code, t.unit_label as string]))
  const queue: QueueRow[] = (rows ?? []).map(r => {
    const staff = r.staff as unknown as QueueRow['staff']
    return {
      ...toOutsideTraining(r),
      created_at: r.created_at as string,
      staff,
      unitLabel: unitByCode.get(staff?.role?.toUpperCase() ?? '') ?? 'unit',
    }
  })

  return <ReviewQueueClient rows={queue} myStaffId={me.id} />
}
