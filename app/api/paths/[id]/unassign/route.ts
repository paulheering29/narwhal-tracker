import { NextRequest, NextResponse } from 'next/server'
import { requirePathManager } from '@/lib/learning-paths'

// Remove a path from a person. Courses they've started stay assigned to them,
// and nothing is ever deleted from their progress, attempts or records.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requirePathManager(params.id)
  if ('error' in gate) return gate.error

  const body = await request.json().catch(() => null)
  const staffId = typeof body?.staffId === 'string' ? body.staffId : ''
  if (!staffId) return NextResponse.json({ error: 'staffId is required.' }, { status: 400 })

  const { error } = await gate.service.rpc('unassign_learning_path', { p_path_id: params.id, p_staff_id: staffId })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
