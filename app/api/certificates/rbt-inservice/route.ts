import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

// Map our modality values to the PDF dropdown options
const MODALITY_MAP: Record<string, string> = {
  'in-person':           'In-person',
  'online-synchronous':  'Online synchronous',
  'online-asynchronous': 'Online asynchronous',
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const recordId = searchParams.get('recordId')

  if (!recordId) {
    return NextResponse.json({ error: 'recordId is required' }, { status: 400 })
  }

  // ── Auth (user client) ───────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Service client (bypasses companies RLS) ──────────────────────────────────
  const service = createServiceClient()

  // ── Fetch training record (user client — RLS ensures they own it) ────────────
  const { data: record, error: recordErr } = await supabase
    .from('training_records')
    .select(`
      id, confirmed, company_id,
      staff:staff_id (
        id, first_name, last_name, display_first_name, display_last_name,
        certification_number, credentials
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

  // ── Fetch company data via service client (bypasses RLS) ─────────────────────
  const { data: company } = await service
    .from('companies')
    .select('id, name, logo_url, org_contact_staff_id')
    .eq('id', record.company_id as string)
    .single()

  const companyName       = company?.name       ?? ''
  const companyLogoUrl    = company?.logo_url   ?? null
  const orgContactStaffId = (company as unknown as { org_contact_staff_id: string | null } | null)?.org_contact_staff_id ?? null

  // ── Staff / course types ────────────────────────────────────────────────────
  const staff = record.staff as unknown as {
    id: string; first_name: string; last_name: string
    display_first_name: string | null; display_last_name: string | null
    certification_number: string | null; credentials: string | null
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

  // ── Trainer info + signature ────────────────────────────────────────────────
  let trainerCertNumber   = course.trainer_cert_number ?? ''
  let trainerName         = course.trainer_name ?? ''
  let trainerSignatureUrl: string | null = null

  if (course.trainer_staff_id && course.trainer_staff) {
    const ts    = course.trainer_staff
    const first = ts.display_first_name?.trim() || ts.first_name
    const last  = ts.display_last_name?.trim()  || ts.last_name
    const creds = ts.credentials?.trim()
    trainerName         = creds ? `${first} ${last}, ${creds}` : `${first} ${last}`
    trainerCertNumber   = ts.certification_number ?? ''
    trainerSignatureUrl = ts.signature_url ?? null
  }

  // ── Org contact (service client so RLS doesn't block) ───────────────────────
  let orgContactName    = ''
  let orgContactCertNum = ''

  if (orgContactStaffId) {
    const { data: oc } = await service
      .from('staff')
      .select('first_name, last_name, display_first_name, display_last_name, certification_number, credentials')
      .eq('id', orgContactStaffId)
      .single()
    if (oc) {
      const first = (oc.display_first_name as string | null)?.trim() || (oc.first_name as string)
      const last  = (oc.display_last_name  as string | null)?.trim() || (oc.last_name  as string)
      const creds = (oc.credentials as string | null)?.trim()
      orgContactName    = creds ? `${first} ${last}, ${creds}` : `${first} ${last}`
      orgContactCertNum = (oc.certification_number as string | null) ?? ''
    }
  }

  // ── Build staff display name ─────────────────────────────────────────────────
  const staffCreds = staff.credentials?.trim()
  const staffName  = staffCreds
    ? `${staff.first_name} ${staff.last_name}, ${staffCreds}`
    : `${staff.first_name} ${staff.last_name}`

  // ── Format date ─────────────────────────────────────────────────────────────
  const eventDate = course.date
    ? new Date(course.date + 'T00:00:00').toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric',
      })
    : ''

  // ── Load PDF template ────────────────────────────────────────────────────────
  const templatePath  = path.join(process.cwd(), 'public', 'templates', 'rbt-inservice-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const pdfDoc        = await PDFDocument.load(templateBytes)
  const form          = pdfDoc.getForm()

  // ── Fill form fields ─────────────────────────────────────────────────────────
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

  // Org contact fields (try/catch — exact field names vary by template version)
  if (orgContactName) {
    try { form.getTextField('In-Service Organization Contact Name').setText(orgContactName) } catch { /* ignore */ }
  }
  if (orgContactCertNum) {
    try { form.getTextField('In-Service Organization Contact BACB Certification Number').setText(orgContactCertNum) } catch { /* ignore */ }
  }

  const modalityValue = MODALITY_MAP[course.modality ?? '']
  if (modalityValue) {
    try { form.getDropdown('Event Modality').select(modalityValue) } catch { /* ignore */ }
  }

  form.getTextField('Signature Date').setText(eventDate)

  // ── Page reference ───────────────────────────────────────────────────────────
  const pages    = pdfDoc.getPages()
  const page     = pages[pages.length - 1]
  const { width } = page.getSize()

  // ─────────────────────────────────────────────────────────────────────────────
  // DRAWING ORDER: white-outs first → signature on top → logos on top
  // (if signature were drawn first, white-outs would cover it)
  // ─────────────────────────────────────────────────────────────────────────────

  // ── 1. White out unwanted static template text ───────────────────────────────
  // Footer: "Updated 07/2025, Copyright © 2025, BACB® | All rights reserved."
  //         "Behavior Analyst Certification Board | RBT Professional Development … | 1"
  page.drawRectangle({ x: 0, y: 0, width, height: 36, color: rgb(1, 1, 1) })

  // "This document must be signed in accordance with the Acceptable Signatures Policy."
  // Cast a wide net — cover y=44 to y=110 to ensure it's removed regardless of exact position
  page.drawRectangle({ x: 0, y: 44, width, height: 66, color: rgb(1, 1, 1) })

  // ── 2. Embed trainer signature (drawn ON TOP of the white-outs) ──────────────
  if (trainerSignatureUrl) {
    try {
      const sigRes = await fetch(trainerSignatureUrl)
      if (sigRes.ok) {
        const sigBytes = new Uint8Array(await sigRes.arrayBuffer())
        const sigImage = await pdfDoc.embedPng(sigBytes)

        const sigField = form.getField('Signature Field')
        const widgets  = sigField.acroField.getWidgets()

        if (widgets.length > 0) {
          const rect = widgets[0].getRectangle()

          // Scale to 3× the field height; cap width at field width
          const targetH = rect.height * 3
          const dims    = sigImage.scaleToFit(rect.width, targetH)

          // Center signature vertically on the field: signature visual sits on the line
          // Shift 30% downward so the handwriting baseline aligns with the field bottom
          const yOffset = rect.y - dims.height * 0.3

          page.drawImage(sigImage, {
            x:      rect.x + (rect.width - dims.width) / 2,
            y:      yOffset,
            width:  dims.width,
            height: dims.height,
          })
        }
      }
    } catch { /* best-effort */ }
  }

  // ── 3. Logo layout constants ─────────────────────────────────────────────────
  const MARGIN        = 18
  const NARWHAL_W     = 54   // 3/4 inch in pts
  const COMPANY_W     = 81   // 1.5× narwhal
  const LOGO_BOTTOM_Y = 10
  const TEXT_GAP      = 3
  const LINE_H        = 7
  const font          = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const FONT_SIZE     = 5.5

  const textY2      = LOGO_BOTTOM_Y
  const textY1      = textY2 + LINE_H
  const logoBottomY = textY1 + TEXT_GAP

  // ── 4. Narwhal Tracker logo — bottom right ───────────────────────────────────
  try {
    const narwhalPath  = path.join(process.cwd(), 'public', 'narwhal-tracker.jpg')
    const narwhalBytes = fs.readFileSync(narwhalPath)
    const narwhalImage = await pdfDoc.embedJpg(narwhalBytes)
    const narwhalDims  = narwhalImage.scaleToFit(NARWHAL_W, 60)
    const logoX        = width - MARGIN - narwhalDims.width

    page.drawImage(narwhalImage, {
      x: logoX, y: logoBottomY,
      width: narwhalDims.width, height: narwhalDims.height,
    })

    const line1  = 'Generated Using'
    const line2  = 'NarwhalTracker.com'
    const centerX = logoX + narwhalDims.width / 2

    page.drawText(line1, {
      x: centerX - font.widthOfTextAtSize(line1, FONT_SIZE) / 2,
      y: textY1, size: FONT_SIZE, font, color: rgb(0.45, 0.45, 0.45),
    })
    page.drawText(line2, {
      x: centerX - font.widthOfTextAtSize(line2, FONT_SIZE) / 2,
      y: textY2, size: FONT_SIZE, font, color: rgb(0.45, 0.45, 0.45),
    })
  } catch { /* best-effort */ }

  // ── 5. Company logo — bottom left ────────────────────────────────────────────
  if (companyLogoUrl) {
    try {
      const logoRes = await fetch(companyLogoUrl)
      if (logoRes.ok) {
        const logoBytes = new Uint8Array(await logoRes.arrayBuffer())
        const logoImage = await pdfDoc.embedJpg(logoBytes)
        const logoDims  = logoImage.scaleToFit(COMPANY_W, 90)

        page.drawImage(logoImage, {
          x: MARGIN, y: logoBottomY,
          width: logoDims.width, height: logoDims.height,
        })
      }
    } catch { /* best-effort */ }
  }

  // ── Save & return ─────────────────────────────────────────────────────────────
  const pdfBytes      = await pdfDoc.save()
  const safeStaffName = staffName.replace(/[^a-zA-Z0-9]/g, '-')
  const safeDateStr   = (course.date ?? 'undated').replace(/-/g, '')
  const filename      = `RBT-InService-${safeStaffName}-${safeDateStr}.pdf`

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
