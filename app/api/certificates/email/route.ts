import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PDFDocument } from 'pdf-lib'
import { Resend } from 'resend'
import fs from 'fs'
import path from 'path'

const MODALITY_MAP: Record<string, string> = {
  'in-person':           'In-person',
  'online-synchronous':  'Online synchronous',
  'online-asynchronous': 'Online asynchronous',
}

export async function POST(request: NextRequest) {
  const { recordId } = await request.json()

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
        certification_number, email
      ),
      courses:course_id (
        id, name, date, modality, units, validity_months,
        trainer_staff_id, trainer_name, trainer_cert_number,
        trainer_staff:trainer_staff_id (
          id, first_name, last_name, display_first_name, display_last_name,
          certification_number
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
    certification_number: string | null; email: string | null
  }

  const course = record.courses as unknown as {
    id: string; name: string; date: string | null; modality: string | null; units: number | null
    trainer_staff_id: string | null; trainer_name: string | null; trainer_cert_number: string | null
    trainer_staff: {
      first_name: string; last_name: string
      display_first_name: string | null; display_last_name: string | null
      certification_number: string | null
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
    trainerName       = `${first} ${last}`
    trainerCertNumber = ts.certification_number ?? ''

    const { data: trainerProfile } = await supabase
      .from('profiles')
      .select('signature_url')
      .eq('staff_id', course.trainer_staff_id)
      .maybeSingle()
    trainerSignatureUrl = trainerProfile?.signature_url ?? null
  }

  const staffName = `${staff.first_name} ${staff.last_name}`
  const staffDisplayName = `${staff.display_first_name?.trim() || staff.first_name} ${staff.display_last_name?.trim() || staff.last_name}`

  const eventDate = course.date
    ? new Date(course.date + 'T00:00:00').toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric',
      })
    : ''

  // ── Fill PDF ──────────────────────────────────────────────────────────────────
  const templatePath = path.join(process.cwd(), 'public', 'templates', 'rbt-inservice-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const pdfDoc = await PDFDocument.load(templateBytes)
  const form   = pdfDoc.getForm()

  form.getTextField('RBT Name').setText(staffName)
  form.getTextField('RBT BACB Certification Number').setText(staff.certification_number ?? '')
  form.getTextField('Event Name').setText(course.name ?? '')
  form.getTextField('Event Date').setText(eventDate)
  form.getTextField('Total Number of PDUs').setText(
    course.units != null ? String(course.units) : ''
  )
  form.getTextField('Organization Name').setText(companyName)
  form.getTextField('In-Service Trainer Name').setText(trainerName)
  form.getTextField('In-Service Trainer BACB Certification Number').setText(trainerCertNumber)

  const modalityValue = MODALITY_MAP[course.modality ?? '']
  if (modalityValue) {
    try { form.getDropdown('Event Modality').select(modalityValue) } catch { /* ignore */ }
  }

  form.getTextField('Signature Date').setText(eventDate)

  if (trainerSignatureUrl) {
    try {
      const sigRes = await fetch(trainerSignatureUrl)
      if (sigRes.ok) {
        const sigBytes = new Uint8Array(await sigRes.arrayBuffer())
        const sigImage = await pdfDoc.embedPng(sigBytes)
        const sigDateField = form.getTextField('Signature Date')
        const widgets      = sigDateField.acroField.getWidgets()
        if (widgets.length > 0) {
          const fieldRect = widgets[0].getRectangle()
          const page      = pdfDoc.getPages()[pdfDoc.getPageCount() - 1]
          const maxWidth  = 160, maxHeight = 55
          const dims      = sigImage.scaleToFit(maxWidth, maxHeight)
          page.drawImage(sigImage, {
            x: fieldRect.x, y: fieldRect.y + fieldRect.height + 4,
            width: dims.width, height: dims.height,
          })
        }
      }
    } catch { /* best-effort */ }
  }

  const pdfBytes = await pdfDoc.save()

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
