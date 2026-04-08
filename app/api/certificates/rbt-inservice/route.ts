import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PDFDocument } from 'pdf-lib'
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

  // ── Auth ────────────────────────────────────────────────────────────────────
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

  // ── Fetch training record + joins ───────────────────────────────────────────
  const { data: record, error: recordErr } = await supabase
    .from('training_records')
    .select(`
      id, confirmed,
      company:company_id ( name ),
      staff:staff_id (
        id, first_name, last_name, display_first_name, display_last_name
      ),
      courses:course_id (
        id, name, date, modality, units, validity_months,
        trainer_staff_id, trainer_name, trainer_cert_number,
        trainer_staff:trainer_staff_id (
          id, first_name, last_name, display_first_name, display_last_name
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

  // ── Company name (joined directly from the training record) ────────────────
  const companyName = (record.company as unknown as { name: string } | null)?.name ?? ''

  // ── Fetch staff's active RBT certification cycle ────────────────────────────
  const staff = record.staff as unknown as {
    id: string; first_name: string; last_name: string
    display_first_name: string | null; display_last_name: string | null
  }
  const course = record.courses as unknown as {
    id: string; name: string; date: string | null; modality: string | null; units: number | null
    trainer_staff_id: string | null; trainer_name: string | null; trainer_cert_number: string | null
    trainer_staff: { first_name: string; last_name: string; display_first_name: string | null; display_last_name: string | null } | null
  }

  const today = new Date().toISOString().split('T')[0]
  const { data: cycle } = await supabase
    .from('certification_cycles')
    .select('certification_number, certification_type')
    .eq('staff_id', staff.id)
    .lte('start_date', today)
    .gte('end_date', today)
    .eq('certification_type', 'RBT')
    .maybeSingle()

  // ── Fetch trainer cert number + signature if trainer is a staff member ──────
  let trainerCertNumber  = course.trainer_cert_number ?? ''
  let trainerName        = course.trainer_name ?? ''
  let trainerSignatureUrl: string | null = null

  if (course.trainer_staff_id && course.trainer_staff) {
    const ts = course.trainer_staff
    const first = ts.display_first_name?.trim() || ts.first_name
    const last  = ts.display_last_name?.trim()  || ts.last_name
    trainerName = `${first} ${last}`

    // Look up trainer's active cert and signature in parallel
    const [trainerCycleRes, trainerProfileRes] = await Promise.all([
      supabase
        .from('certification_cycles')
        .select('certification_number')
        .eq('staff_id', course.trainer_staff_id)
        .lte('start_date', today)
        .gte('end_date', today)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('signature_url')
        .eq('staff_id', course.trainer_staff_id)
        .maybeSingle(),
    ])

    trainerCertNumber  = trainerCycleRes.data?.certification_number ?? ''
    trainerSignatureUrl = trainerProfileRes.data?.signature_url ?? null
  }

  // ── Build display names ─────────────────────────────────────────────────────
  // Legal name for official certification documents
  const staffName = `${staff.first_name} ${staff.last_name}`

  // ── Format date ─────────────────────────────────────────────────────────────
  const eventDate = course.date
    ? new Date(course.date + 'T00:00:00').toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric',
      })
    : ''

  // ── Fill PDF ─────────────────────────────────────────────────────────────────
  const templatePath = path.join(process.cwd(), 'public', 'templates', 'rbt-inservice-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const pdfDoc = await PDFDocument.load(templateBytes)
  const form  = pdfDoc.getForm()

  form.getTextField('RBT Name').setText(staffName)
  form.getTextField('RBT BACB Certification Number').setText(cycle?.certification_number ?? '')
  form.getTextField('Event Name').setText(course.name ?? '')
  form.getTextField('Event Date').setText(eventDate)
  form.getTextField('Total Number of PDUs').setText(
    course.units != null ? String(course.units) : ''
  )
  form.getTextField('Organization Name').setText(companyName)
  form.getTextField('In-Service Trainer Name').setText(trainerName)
  form.getTextField('In-Service Trainer BACB Certification Number').setText(trainerCertNumber)

  // Set modality dropdown
  const modalityValue = MODALITY_MAP[course.modality ?? '']
  if (modalityValue) {
    try {
      form.getDropdown('Event Modality').select(modalityValue)
    } catch {
      // Ignore if value not in options
    }
  }

  form.getTextField('Signature Date').setText(eventDate)

  // ── Embed trainer signature image ────────────────────────────────────────────
  if (trainerSignatureUrl) {
    try {
      const sigRes = await fetch(trainerSignatureUrl)
      if (sigRes.ok) {
        const sigArrayBuffer = await sigRes.arrayBuffer()
        const sigBytes       = new Uint8Array(sigArrayBuffer)
        const sigImage       = await pdfDoc.embedPng(sigBytes)

        // Find where the Signature Date field sits so we can position above it
        const sigDateField = form.getTextField('Signature Date')
        const widgets      = sigDateField.acroField.getWidgets()

        if (widgets.length > 0) {
          const fieldRect = widgets[0].getRectangle()
          const pages     = pdfDoc.getPages()
          // Signature field is on the last page of the BACB form
          const page      = pages[pages.length - 1]

          // Scale the image to fit neatly above the date field
          const maxWidth  = 160
          const maxHeight = 55
          const dims      = sigImage.scaleToFit(maxWidth, maxHeight)

          page.drawImage(sigImage, {
            x:      fieldRect.x,
            y:      fieldRect.y + fieldRect.height + 4,
            width:  dims.width,
            height: dims.height,
          })
        }
      }
    } catch {
      // Signature embedding is best-effort — continue without it if anything fails
    }
  }

  // Flatten to prevent further editing (optional — comment out to keep fillable)
  // form.flatten()

  const pdfBytes = await pdfDoc.save()

  // ── Return PDF ───────────────────────────────────────────────────────────────
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
