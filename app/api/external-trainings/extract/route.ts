import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import {
  EXTRACTION_LIMIT_MESSAGE, EXTRACTION_MAX_BYTES, EXTRACTION_MODEL, EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA, EXTRACTION_YEARLY_LIMIT, namesMatch, validateExtraction,
} from '@/lib/certificate-extraction'

export const maxDuration = 60

const BUCKET = 'cert-cycle-documents'

// Expected failures come back as 200 { ok: false } so the form can just show
// the message and stay usable; extraction must never block manual entry.
const fail = (reason: string, message: string) => NextResponse.json({ ok: false, reason, message })

function sniff(b: Buffer): { kind: 'pdf' } | { kind: 'image'; mediaType: 'image/jpeg' | 'image/png' } | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf' }
  if (b[0] === 0xff && b[1] === 0xd8) return { kind: 'image', mediaType: 'image/jpeg' }
  if (b.subarray(1, 4).toString('latin1') === 'PNG') return { kind: 'image', mediaType: 'image/png' }
  return null
}

/**
 * Read a certificate already uploaded to the private bucket and return
 * suggested form values. Saves nothing: the person reviews and saves through
 * the normal path, so review_status rules apply unchanged.
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

  const body = await request.json().catch(() => null)
  const path: string = typeof body?.path === 'string' ? body.path : ''

  const service = createServiceClient()
  const { data: me } = await service
    .from('staff')
    .select('id, company_id, tier')
    .eq('auth_id', user.id)
    .single()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // {company_id}/external/{staff_id}/{file}: must be this company's, and the
  // caller's own folder unless they're staff tier acting for someone else.
  const parts = path.split('/')
  const [pathCompany, folder, pathStaff, file] = parts
  if (
    parts.length !== 4 || folder !== 'external' || !file ||
    parts.some(p => p === '' || p === '..') ||
    pathCompany !== me.company_id ||
    (pathStaff !== me.id && me.tier !== 'staff')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: target } = await service
    .from('staff')
    .select('first_name, last_name, display_first_name, display_last_name')
    .eq('id', pathStaff)
    .eq('company_id', me.company_id)
    .single()
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return fail('unavailable', 'Certificate import isn’t available right now. Please enter the details manually.')
  }

  const { data: blob, error: dlErr } = await service.storage.from(BUCKET).download(path)
  if (dlErr || !blob) return fail('unreadable', 'We couldn’t read that file. Please enter the details manually.')
  if (blob.size > EXTRACTION_MAX_BYTES) return fail('too_large', 'That file is over 10 MB. Please enter the details manually.')
  const bytes = Buffer.from(await blob.arrayBuffer())
  const kind = sniff(bytes)
  if (!kind) return fail('unsupported', 'We can only read PDF, JPEG or PNG certificates. Please enter the details manually.')

  // Limit is per person per calendar year; failed calls count, rejections above don't.
  const yearStart = `${new Date().getUTCFullYear()}-01-01T00:00:00Z`
  const { count } = await service
    .from('certificate_extractions')
    .select('id', { count: 'exact', head: true })
    .eq('staff_id', me.id)
    .gte('created_at', yearStart)
  if ((count ?? 0) >= EXTRACTION_YEARLY_LIMIT) return fail('limit', EXTRACTION_LIMIT_MESSAGE)

  let success = false
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  try {
    const client = new Anthropic({ timeout: 40_000, maxRetries: 0 })
    const data = bytes.toString('base64')
    const response = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
      },
      system: EXTRACTION_PROMPT,
      messages: [{
        role: 'user',
        content: [
          kind.kind === 'pdf'
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
            : { type: 'image', source: { type: 'base64', media_type: kind.mediaType, data } },
          { type: 'text', text: 'Extract the certificate details.' },
        ],
      }],
    })
    inputTokens  = response.usage.input_tokens
    outputTokens = response.usage.output_tokens

    const text = response.content.find(b => b.type === 'text')
    if (response.stop_reason !== 'end_turn' || !text || text.type !== 'text') throw new Error('no result')
    const extraction = validateExtraction(JSON.parse(text.text))
    success = true

    const nameMismatch = !!extraction.participant_name && !namesMatch(extraction.participant_name, target)
    return NextResponse.json({ ok: true, extraction, nameMismatch })
  } catch (err) {
    // Status only: never log messages or contents that could carry certificate data.
    console.error('certificate extraction failed', err instanceof Anthropic.APIError ? err.status : 'error')
    return fail('failed', 'We couldn’t read that certificate. Please enter the details manually.')
  } finally {
    await service.from('certificate_extractions').insert({
      company_id: me.company_id, staff_id: me.id, success,
      model: EXTRACTION_MODEL, input_tokens: inputTokens, output_tokens: outputTokens,
    })
  }
}
