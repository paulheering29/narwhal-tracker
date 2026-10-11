import { NextRequest, NextResponse } from 'next/server'
import { requirePathManager } from '@/lib/learning-paths'

// Assign a path to one or more people. Each person is all-or-nothing, and
// anyone who already has the path is left alone (see assign_learning_path).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requirePathManager(params.id)
  if ('error' in gate) return gate.error

  const body = await request.json().catch(() => null)
  const staffIds: string[] = Array.isArray(body?.staffIds)
    ? Array.from(new Set(body.staffIds.filter((s: unknown): s is string => typeof s === 'string')))
    : []
  if (staffIds.length === 0) return NextResponse.json({ error: 'Choose at least one person.' }, { status: 400 })
  if (gate.path.archived_at) return NextResponse.json({ error: 'This path is archived.' }, { status: 400 })

  const { data, error } = await gate.service.rpc('assign_learning_path', {
    p_path_id: params.id, p_staff_ids: staffIds, p_assigned_by: gate.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const results = (data ?? []) as { out_staff_id: string; out_assigned: boolean; out_message: string | null }[]
  return NextResponse.json({
    assigned: results.filter(r => r.out_assigned).map(r => r.out_staff_id),
    skipped:  results.filter(r => !r.out_assigned && r.out_message === 'Already assigned').map(r => r.out_staff_id),
    failed:   results.filter(r => !r.out_assigned && r.out_message !== 'Already assigned')
                     .map(r => ({ staffId: r.out_staff_id, error: r.out_message })),
  })
}
