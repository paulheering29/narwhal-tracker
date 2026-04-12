import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
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
  const recordId = searchParams.get('recordId')
  const template = searchParams.get('template')
  if (!recordId) return NextResponse.json({ error: 'recordId is required' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: record, error: recordErr } = await supabase
    .from('training_records')
    .select(`
      id, confirmed, company_id,
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
    .eq('id', recordId)
    .single()

  if (recordErr || !record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  if (!record.confirmed)    return NextResponse.json({ error: 'Attendance not confirmed' }, { status: 400 })

  const { data: company } = await service
    .from('companies')
    .select('name, logo_url, org_contact_staff_id, preferred_cert_template, enabled_cert_templates')
    .eq('id', record.company_id as string)
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

  const companyInfo = { name: company?.name ?? '', logoUrl: company?.logo_url ?? null }
  const { cert, courseDate } = buildCertData(record as unknown as RecordShape, companyInfo, orgContact)
  const pdfBytes = await generateCertPdf(cert, selectedTemplate)

  const filename = certFilename(cert.staffName, courseDate)

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
