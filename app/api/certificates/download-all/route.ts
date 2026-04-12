import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import JSZip from 'jszip'
import {
  buildCertData,
  certFilename,
  generateCertPdf,
  resolveTemplate,
  type OrgContact,
  type RecordShape,
} from '@/lib/certificates/generate-cert'

type CompanyRow = {
  name: string
  logo_url: string | null
  org_contact_staff_id: string | null
  preferred_cert_template: string | null
  enabled_cert_templates:  string[] | null
}

type OrgContactRow = {
  first_name: string
  last_name:  string
  display_first_name: string | null
  display_last_name:  string | null
  certification_number: string | null
  credentials: string | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const courseId = searchParams.get('courseId')
  const template = searchParams.get('template')
  if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: me } = await service
    .from('staff')
    .select('company_id')
    .eq('auth_id', user.id)
    .single()
  if (!me?.company_id) return NextResponse.json({ error: 'No company' }, { status: 404 })

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

  // Match the UI: a person is an "RBT" if they have an RBT cycle active
  // right now — regardless of the course date. (The course might be in
  // the past or the cycle may have started after the course.)
  const today    = new Date().toISOString().split('T')[0]
  const staffIds = Array.from(new Set(records.map(r => r.staff_id as string)))
  const { data: cycles } = await service
    .from('certification_cycles')
    .select('staff_id, certification_type')
    .in('staff_id', staffIds)
    .lte('start_date', today)
    .gte('end_date',   today)

  const rbtStaffIds = new Set(
    (cycles ?? [])
      .filter(c => c.certification_type === 'RBT')
      .map(c => c.staff_id),
  )
  const rbtRecords = records.filter(r => rbtStaffIds.has(r.staff_id as string))

  if (rbtRecords.length === 0) {
    return NextResponse.json({ error: 'No active RBT attendees for this training' }, { status: 404 })
  }

  const { data: company } = await service
    .from('companies')
    .select('name, logo_url, org_contact_staff_id, preferred_cert_template, enabled_cert_templates')
    .eq('id', me.company_id)
    .single<CompanyRow>()

  const enabledTemplates = company?.enabled_cert_templates ?? ['bacb']
  const selectedTemplate = resolveTemplate(template, enabledTemplates, company?.preferred_cert_template)

  let orgContact: OrgContact = null
  if (company?.org_contact_staff_id) {
    const { data: oc } = await service
      .from('staff')
      .select('first_name, last_name, display_first_name, display_last_name, certification_number, credentials')
      .eq('id', company.org_contact_staff_id)
      .single<OrgContactRow>()
    if (oc) {
      const fn = oc.display_first_name?.trim() || oc.first_name
      const ln = oc.display_last_name?.trim()  || oc.last_name
      const cr = oc.credentials?.trim()
      orgContact = {
        name:       cr ? `${fn} ${ln}, ${cr}` : `${fn} ${ln}`,
        certNumber: oc.certification_number ?? '',
      }
    }
  }

  // Generate all PDFs in parallel. pdf-lib is pure JS and creates a
  // fresh PDFDocument per call, so there's no shared mutable state.
  const companyInfo = { name: company?.name ?? '', logoUrl: company?.logo_url ?? null }
  const pdfEntries = await Promise.all(
    rbtRecords.map(async record => {
      const { cert, courseDate } = buildCertData(record as unknown as RecordShape, companyInfo, orgContact)
      const pdfBytes = await generateCertPdf(cert, selectedTemplate)
      return { filename: certFilename(cert.staffName, courseDate), pdfBytes }
    }),
  )

  const courseRow  = records[0].courses as unknown as { name: string; date: string | null }
  const folderName = (courseRow.name?.trim() || 'Training').replace(/[\/\\:*?"<>|]/g, '-')

  const zip    = new JSZip()
  const folder = zip.folder(folderName)!
  for (const { filename, pdfBytes } of pdfEntries) {
    folder.file(filename, pdfBytes)
  }

  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const safeName = (courseRow.name ?? 'training').replace(/[^a-zA-Z0-9]/g, '-')
  const safeDate = (courseRow.date ?? 'undated').replace(/-/g, '')
  const zipName  = `certificates-${safeName}-${safeDate}.zip`

  return new Response(Buffer.from(zipBytes), {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    },
  })
}
