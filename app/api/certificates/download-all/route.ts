import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import JSZip from 'jszip'
import {
  buildCertData,
  generateCertPdf,
  resolveTemplate,
  certFilename,
  type OrgContact,
} from '@/lib/certificates/generate-cert'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const courseId = searchParams.get('courseId')
  const template = searchParams.get('template')
  if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 })

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // ── Resolve caller's company via staff row ──────────────────────────────────
  const { data: me } = await service
    .from('staff')
    .select('company_id')
    .eq('auth_id', user.id)
    .single()
  if (!me?.company_id) return NextResponse.json({ error: 'No company' }, { status: 404 })

  // ── Fetch all confirmed training records for this course in the user's company
  const { data: records, error: recordsErr } = await supabase
    .from('training_records')
    .select(`
      id, confirmed, company_id, staff_id,
      staff:staff_id (
        id, first_name, last_name, display_first_name, display_last_name,
        certification_number, credentials
      ),
      courses:course_id (
        id, name, date, modality, units,
        trainer_staff_id, trainer_name, trainer_cert_number,
        trainer_staff:trainer_staff_id (
          first_name, last_name, display_first_name, display_last_name,
          certification_number, signature_url, credentials
        )
      )
    `)
    .eq('course_id', courseId)
    .eq('confirmed', true)

  if (recordsErr) return NextResponse.json({ error: recordsErr.message }, { status: 500 })
  if (!records || records.length === 0) {
    return NextResponse.json({ error: 'No confirmed attendees for this training' }, { status: 404 })
  }

  // ── Filter to RBTs only (staff_id has an active cert cycle covering the course date)
  // For simplicity: use the course date as the reference point. If no date, fall back to today.
  const course0 = records[0].courses as unknown as { date: string | null }
  const refDate = course0.date ?? new Date().toISOString().split('T')[0]

  const staffIds = Array.from(new Set(records.map(r => r.staff_id as string)))
  const { data: cycles } = await service
    .from('certification_cycles')
    .select('staff_id, start_date, end_date, certification_type')
    .in('staff_id', staffIds)
    .lte('start_date', refDate)
    .gte('end_date',   refDate)

  const rbtStaffIds = new Set(
    (cycles ?? [])
      .filter(c => c.certification_type === 'RBT')
      .map(c => c.staff_id),
  )
  const rbtRecords = records.filter(r => rbtStaffIds.has(r.staff_id as string))

  if (rbtRecords.length === 0) {
    return NextResponse.json({ error: 'No active RBT attendees for this training' }, { status: 404 })
  }

  // ── Fetch company once ───────────────────────────────────────────────────────
  const { data: company } = await service
    .from('companies')
    .select('name, logo_url, org_contact_staff_id, preferred_cert_template, enabled_cert_templates')
    .eq('id', me.company_id)
    .single()

  const companyName       = company?.name        ?? ''
  const companyLogoUrl    = (company?.logo_url as string | null) ?? null
  const orgContactStaffId = (company?.org_contact_staff_id as string | null) ?? null
  const enabledTemplates  = ((company?.enabled_cert_templates as string[] | null) ?? ['bacb'])
  const preferredTemplate = (company?.preferred_cert_template as string | null) ?? 'bacb'
  const selectedTemplate  = resolveTemplate(template, enabledTemplates, preferredTemplate)

  // ── Fetch org contact once ───────────────────────────────────────────────────
  let orgContact: OrgContact = null
  if (orgContactStaffId) {
    const { data: oc } = await service
      .from('staff')
      .select('first_name, last_name, display_first_name, display_last_name, certification_number, credentials')
      .eq('id', orgContactStaffId)
      .single()
    if (oc) {
      const fn = (oc.display_first_name as string | null)?.trim() || (oc.first_name as string)
      const ln = (oc.display_last_name  as string | null)?.trim() || (oc.last_name  as string)
      const cr = (oc.credentials as string | null)?.trim()
      orgContact = {
        name:       cr ? `${fn} ${ln}, ${cr}` : `${fn} ${ln}`,
        certNumber: (oc.certification_number as string | null) ?? '',
      }
    }
  }

  // ── Generate each PDF and add to the ZIP ────────────────────────────────────
  const zip = new JSZip()
  const folderName = (course0.date ? `certs-${course0.date}` : 'certs')
  const folder = zip.folder(folderName)!

  for (const record of rbtRecords) {
    const built = buildCertData(
      record as unknown as Parameters<typeof buildCertData>[0],
      { name: companyName, logoUrl: companyLogoUrl },
      orgContact,
    )
    const pdfBytes = await generateCertPdf(built, selectedTemplate)
    folder.file(certFilename(built.staffName, built.courseDate), pdfBytes)
  }

  // ── Build ZIP and respond ───────────────────────────────────────────────────
  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  // Training-level filename
  const courseRow = records[0].courses as unknown as { name: string; date: string | null }
  const safeName  = (courseRow.name ?? 'training').replace(/[^a-zA-Z0-9]/g, '-')
  const safeDate  = (courseRow.date ?? 'undated').replace(/-/g, '')
  const zipName   = `certificates-${safeName}-${safeDate}.zip`

  return new Response(Buffer.from(zipBytes), {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    },
  })
}
