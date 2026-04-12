import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { cookies } from 'next/headers'
import { Resend } from 'resend'
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

export async function POST(request: NextRequest) {
  const { recordId, template } = await request.json()
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
        certification_number, email, credentials
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
  if (!record.confirmed)    return NextResponse.json({ error: 'Attendance not confirmed for this record' }, { status: 400 })

  // buildCertData's RecordShape doesn't include staff.email (cert-only
  // fields). Grab it off the raw record for the email recipient.
  const staff = record.staff as unknown as {
    first_name: string; last_name: string
    display_first_name: string | null; display_last_name: string | null
    email: string | null
  }
  if (!staff.email) {
    return NextResponse.json({ error: 'Staff member has no email address on file.' }, { status: 400 })
  }
  const staffDisplayName = `${staff.display_first_name?.trim() || staff.first_name} ${staff.display_last_name?.trim() || staff.last_name}`

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

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendError } = await resend.emails.send({
    from: 'Narwhal Tracker <noreply@narwhaltracker.com>',
    to:   staff.email,
    subject: `Your RBT In-Service Certificate — ${cert.trainingName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: #0A253D; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Narwhal Tracker</h1>
        </div>
        <div style="background: #f9fafb; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hi ${staffDisplayName},</p>
          <p style="margin: 0 0 16px;">
            Your RBT In-Service certificate for <strong>${cert.trainingName}</strong>
            ${courseDate ? ` on <strong>${cert.eventDate}</strong>` : ''} is attached to this email.
          </p>
          <p style="margin: 0 0 16px;">
            You earned <strong>${cert.pduCount || '0'} PDU${cert.pduCount === '1' ? '' : 's'}</strong>
            for this training${cert.companyName ? ` with ${cert.companyName}` : ''}.
          </p>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Keep this certificate for your BACB records.
          </p>
        </div>
      </div>
    `,
    attachments: [{ filename, content: Buffer.from(pdfBytes).toString('base64') }],
  })

  if (sendError) return NextResponse.json({ error: sendError.message }, { status: 500 })
  return NextResponse.json({ success: true, sentTo: staff.email })
}
