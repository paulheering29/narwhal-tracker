import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'
import { cookies } from 'next/headers'
import { PDFDocument } from 'pdf-lib'
import { Resend } from 'resend'
import fs from 'fs'
import path from 'path'
import type { CertData } from '@/lib/certificates/types'
import { generateFormal } from '@/lib/certificates/formal'
import { generateFun }    from '@/lib/certificates/fun'
import { generateBasic }  from '@/lib/certificates/basic'

const MODALITY_LABELS: Record<string, string> = {
  'in-person':           'In-person',
  'online-synchronous':  'Online synchronous',
  'online-asynchronous': 'Online asynchronous',
}

// ── BACB fillable template ───────────────────────────────────────────────────────
async function generateBacb(data: CertData): Promise<Uint8Array> {
  const templatePath  = path.join(process.cwd(), 'public', 'templates', 'rbt-inservice-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const pdfDoc        = await PDFDocument.load(templateBytes)
  const form          = pdfDoc.getForm()

  form.getTextField('RBT Name').setText(data.staffName)
  form.getTextField('RBT BACB Certification Number').setText(data.certNumber)
  form.getTextField('Event Name').setText(data.trainingName)
  form.getTextField('Event Date').setText(data.eventDate)
  form.getTextField('Total Number of PDUs').setText(data.pduCount)
  form.getTextField('Organization Name').setText(data.companyName)
  form.getTextField('In-Service Trainer Name').setText(data.trainerName)
  form.getTextField('In-Service Trainer BACB Certification Number').setText(data.trainerCertNumber)

  if (data.orgContactName) {
    try { form.getTextField('In-Service Organization Contact Name').setText(data.orgContactName) } catch { /* ignore */ }
  }
  if (data.orgContactCertNumber) {
    try { form.getTextField('In-Service Organization Contact BACB Certification Number').setText(data.orgContactCertNumber) } catch { /* ignore */ }
  }

  const modalityValue = Object.entries(MODALITY_LABELS).find(([k]) => k === data.modality)?.[1]
  if (modalityValue) {
    try { form.getDropdown('Event Modality').select(modalityValue) } catch { /* ignore */ }
  }

  form.getTextField('Signature Date').setText(data.eventDate)

  // Signature — small to fit the field
  if (data.trainerSignatureUrl) {
    try {
      const sigRes = await fetch(data.trainerSignatureUrl)
      if (sigRes.ok) {
        const sigBytes = new Uint8Array(await sigRes.arrayBuffer())
        const sigImage = await pdfDoc.embedPng(sigBytes)
        const sigField = form.getField('Signature Field')
        const widgets  = sigField.acroField.getWidgets()
        if (widgets.length > 0) {
          const rect = widgets[0].getRectangle()
          const dims = sigImage.scaleToFit(rect.width - 4, rect.height - 2)
          const pages = pdfDoc.getPages()
          pages[pages.length - 1].drawImage(sigImage, {
            x: rect.x + (rect.width - dims.width) / 2,
            y: rect.y + (rect.height - dims.height) / 2,
            width: dims.width, height: dims.height,
          })
        }
      }
    } catch { /* best-effort */ }
  }

  return pdfDoc.save()
}

export async function POST(request: NextRequest) {
  const { recordId, template } = await request.json()

  if (!recordId) {
    return NextResponse.json({ error: 'recordId is required' }, { status: 400 })
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Fetch training record + joins ─────────────────────────────────────────────
  const { data: record, error: recordErr } = await supabase
    .from('training_records')
    .select(`
      id, confirmed,
      company:company_id ( name ),
      staff:staff_id (
        id, first_name, last_name, display_first_name, display_last_name,
        certification_number, email, credentials
      ),
      courses:course_id (
        id, name, date, modality, units, validity_months,
        trainer_staff_id, trainer_name, trainer_cert_number,
        trainer_staff:trainer_staff_id (
          id, first_name, last_name, display_first_name, display_last_name,
          certification_number, signature_url, credentials
        )
      )
    `)
    .eq('id', recordId)
    .single()

  if (recordErr || !record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  if (!record.confirmed) {
    return NextResponse.json({ error: 'Attendance not confirmed for this record' }, { status: 400 })
  }

  const companyName = (record.company as unknown as { name: string } | null)?.name ?? ''

  const staff = record.staff as unknown as {
    id: string; first_name: string; last_name: string
    display_first_name: string | null; display_last_name: string | null
    certification_number: string | null; email: string | null; credentials: string | null
  }

  const course = record.courses as unknown as {
    id: string; name: string; date: string | null; modality: string | null; units: number | null
    trainer_staff_id: string | null; trainer_name: string | null; trainer_cert_number: string | null
    trainer_staff: {
      first_name: string; last_name: string
      display_first_name: string | null; display_last_name: string | null
      certification_number: string | null; signature_url: string | null; credentials: string | null
    } | null
  }

  if (!staff.email) {
    return NextResponse.json({ error: 'Staff member has no email address on file.' }, { status: 400 })
  }

  // ── Trainer info + signature ──────────────────────────────────────────────────
  let trainerCertNumber   = course.trainer_cert_number ?? ''
  let trainerName         = course.trainer_name ?? ''
  let trainerSignatureUrl: string | null = null

  if (course.trainer_staff_id && course.trainer_staff) {
    const ts = course.trainer_staff
    const first = ts.display_first_name?.trim() || ts.first_name
    const last  = ts.display_last_name?.trim()  || ts.last_name
    const creds = ts.credentials?.trim()
    trainerName         = creds ? `${first} ${last}, ${creds}` : `${first} ${last}`
    trainerCertNumber   = ts.certification_number ?? ''
    trainerSignatureUrl = ts.signature_url ?? null
  }

  const staffCreds = staff.credentials?.trim()
  const staffName  = staffCreds
    ? `${staff.first_name} ${staff.last_name}, ${staffCreds}`
    : `${staff.first_name} ${staff.last_name}`
  const staffDisplayName = `${staff.display_first_name?.trim() || staff.first_name} ${staff.display_last_name?.trim() || staff.last_name}`

  const eventDate = course.date
    ? new Date(course.date + 'T00:00:00').toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric',
      })
    : ''

  // ── Fetch company to get template preferences ────────────────────────────────
  const service = createServiceClient()
  const { data: company } = await service
    .from('companies')
    .select('name, logo_url, org_contact_staff_id, preferred_cert_template, enabled_cert_templates')
    .eq('id', (record as Record<string, unknown>).company_id as string)
    .single()

  const companyLogoUrl    = (company as Record<string, unknown> | null)?.logo_url as string | null ?? null
  const orgContactStaffId = (company as Record<string, unknown> | null)?.org_contact_staff_id as string | null ?? null
  const enabledTemplates  = ((company as Record<string, unknown> | null)?.enabled_cert_templates as string[] | null) ?? ['bacb']
  const preferredTemplate = ((company as Record<string, unknown> | null)?.preferred_cert_template as string | null) ?? 'bacb'

  // Use query param template if provided, otherwise use preferred, otherwise use first enabled
  let selectedTemplate = template ?? preferredTemplate ?? 'bacb'

  // Validate that the selected template is enabled
  if (!enabledTemplates.includes(selectedTemplate)) {
    selectedTemplate = enabledTemplates[0] ?? 'bacb'
  }

  // ── Org contact ───────────────────────────────────────────────────────────────
  let orgContactName    = ''
  let orgContactCertNum = ''
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
      orgContactName    = cr ? `${fn} ${ln}, ${cr}` : `${fn} ${ln}`
      orgContactCertNum = (oc.certification_number as string | null) ?? ''
    }
  }

  // ── Build cert data ───────────────────────────────────────────────────────────
  const certData: CertData = {
    staffName,
    certNumber:           staff.certification_number ?? '',
    trainingName:         course.name                ?? '',
    eventDate,
    pduCount:             course.units != null ? String(course.units) : '',
    modality:             MODALITY_LABELS[course.modality ?? ''] ?? course.modality ?? '',
    trainerName,
    trainerCertNumber,
    companyName,
    orgContactName,
    orgContactCertNumber: orgContactCertNum,
    trainerSignatureUrl,
    companyLogoUrl,
    narwhalLogoPath: path.join(process.cwd(), 'public', 'narwhal-tracker.jpg'),
  }

  // ── Generate PDF ──────────────────────────────────────────────────────────────
  let pdfBytes: Uint8Array
  switch (selectedTemplate) {
    case 'formal': pdfBytes = await generateFormal(certData); break
    case 'fun':    pdfBytes = await generateFun(certData);    break
    case 'basic':  pdfBytes = await generateBasic(certData);  break
    default:       pdfBytes = await generateBacb(certData);   break
  }

  // ── Send via Resend ───────────────────────────────────────────────────────────
  const resend = new Resend(process.env.RESEND_API_KEY)

  const safeStaffName = staffName.replace(/[^a-zA-Z0-9]/g, '-')
  const safeDateStr   = (course.date ?? 'undated').replace(/-/g, '')
  const filename      = `RBT-InService-${safeStaffName}-${safeDateStr}.pdf`

  const { error: sendError } = await resend.emails.send({
    from: 'Narwhal Tracker <noreply@narwhaltracker.com>',
    to:   staff.email,
    subject: `Your RBT In-Service Certificate — ${course.name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: #0A253D; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Narwhal Tracker</h1>
        </div>
        <div style="background: #f9fafb; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hi ${staffDisplayName},</p>
          <p style="margin: 0 0 16px;">
            Your RBT In-Service certificate for <strong>${course.name}</strong>
            ${course.date ? ` on <strong>${eventDate}</strong>` : ''} is attached to this email.
          </p>
          <p style="margin: 0 0 16px;">
            You earned <strong>${course.units ?? 0} PDU${course.units !== 1 ? 's' : ''}</strong>
            for this training${companyName ? ` with ${companyName}` : ''}.
          </p>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Keep this certificate for your BACB records.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename,
        content: Buffer.from(pdfBytes).toString('base64'),
      },
    ],
  })

  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, sentTo: staff.email })
}
