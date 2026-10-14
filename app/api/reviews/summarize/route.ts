import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageTrainings } from '@/lib/permissions'
import { EXTRACTION_MODEL } from '@/lib/certificate-extraction'

export const maxDuration = 60

const PROMPT =
  'You summarize learner reviews of a training course for the course owner. Write 2-4 plain sentences: ' +
  'what learners liked, what they criticized, and one concrete suggestion if the feedback supports one. ' +
  'Base it only on the reviews given; do not invent details. No headings or bullet points.'

/**
 * Regenerate the summary for every course whose reviews changed since its
 * stored summary. Called by the Reviews page on load; returns the fresh rows.
 */
export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('staff').select('tier, roles').eq('auth_id', user.id).single()
  if ((me?.tier ?? 'rbt') === 'rbt' || !canManageTrainings((me?.roles ?? []) as string[])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Read through the user's session so RLS keeps this to their own company.
  const [{ data: reviews }, { data: stored }] = await Promise.all([
    supabase.from('course_reviews').select('course_id, company_id, rating, comment, updated_at, courses:course_id(name)'),
    supabase.from('review_summaries').select('course_id, review_count, latest_review_at'),
  ])

  type Group = { companyId: string; name: string; rows: { rating: number; comment: string | null }[]; count: number; latest: string; hasComment: boolean }
  const groups = new Map<string, Group>()
  for (const r of reviews ?? []) {
    const g: Group = groups.get(r.course_id) ?? {
      companyId: r.company_id,
      name: (r.courses as unknown as { name: string } | null)?.name ?? 'Course',
      rows: [], count: 0, latest: r.updated_at, hasComment: false,
    }
    g.rows.push({ rating: r.rating, comment: r.comment })
    g.count += 1
    if (r.updated_at > g.latest) g.latest = r.updated_at
    if (r.comment?.trim()) g.hasComment = true
    groups.set(r.course_id, g)
  }

  const storedBy = new Map((stored ?? []).map(s => [s.course_id, s]))
  // Courses with only star ratings give the model nothing to summarize.
  const stale = Array.from(groups.entries()).filter(([id, g]) => {
    const s = storedBy.get(id)
    return g.hasComment && (!s || s.review_count !== g.count || new Date(s.latest_review_at).getTime() !== new Date(g.latest).getTime())
  })

  if (stale.length) {
    const anthropic = new Anthropic()
    const service = createServiceClient()
    // Per-course failures are skipped so one bad call doesn't block the rest.
    await Promise.all(stale.map(async ([courseId, g]) => {
      try {
        const lines = g.rows.map(r => `${r.rating}/5${r.comment?.trim() ? `: ${r.comment.trim()}` : ''}`).join('\n')
        const msg = await anthropic.messages.create({
          model: EXTRACTION_MODEL,
          max_tokens: 400,
          system: PROMPT,
          messages: [{ role: 'user', content: `Course: ${g.name}\n\nReviews:\n${lines}` }],
        })
        const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
        if (!text) return
        await service.from('review_summaries').upsert({
          course_id: courseId, company_id: g.companyId, summary: text,
          review_count: g.count, latest_review_at: g.latest, generated_at: new Date().toISOString(),
        })
      } catch (e) {
        console.error('review summary failed', courseId, e)
      }
    }))
  }

  const { data: fresh } = await supabase.from('review_summaries').select('course_id, summary, generated_at')
  return NextResponse.json({ summaries: fresh ?? [] })
}
