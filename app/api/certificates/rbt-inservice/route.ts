import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { PDFDocument } from 'pdf-lib'
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

// ── BACB fillable template (template 1 — left completely as-is) ───────────────
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

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const recordId = searchParams.get('recordId')
  if (!recordId) return NextResponse.json({ error: 'recordId is required' }, { status: 400 })

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // ── Fetch training record ─────────────────────────────────────────────────────
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

  // ── Fetch company via service client (bypasses RLS) ───────────────────────────
  const { data: company } = await service
    .from('companies')
    .select('name, logo_url, org_contact_staff_id, preferred_cert_template')
    .eq('id', record.company_id as string)
    .single()

  const companyName       = company?.name       ?? ''
  const companyLogoUrl    = (company as Record<string, unknown> | null)?.logo_url as string | null ?? null
  const orgContactStaffId = (company as Record<string, unknown> | null)?.org_contact_staff_id as string | null ?? null
  const template          = ((company as Record<string, unknown> | null)?.preferred_cert_template as string | null) ?? 'bacb'

  // ── Shape types ───────────────────────────────────────────────────────────────
  const staff = record.staff as unknown as {
    first_name: string; last_name: string
    display_first_name: string | null; display_last_name: string | null
    certification_number: string | null; credentials: string | null
  }
  const course = record.courses as unknown as {
    name: string; date: string | null; modality: string | null; units: number | null
    trainer_staff_id: string | null; trainer_name: string | null; trainer_cert_number: string | null
    trainer_staff: {
      first_name: string; last_name: string
      display_first_name: string | null; display_last_name: string | null
      certification_number: string | null; signature_url: string | null; credentials: string | null
    } | null
  }

  // ── Trainer ───────────────────────────────────────────────────────────────────
  let trainerName         = course.trainer_name        ?? ''
  let trainerCertNumber   = course.trainer_cert_number ?? ''
  let trainerSignatureUrl: string | null = null

  if (course.trainer_staff_id && course.trainer_staff) {
    const ts  = course.trainer_staff
    const fn  = ts.display_first_name?.trim() || ts.first_name
    const ln  = ts.display_last_name?.trim()  || ts.last_name
    const cr  = ts.credentials?.trim()
    trainerName         = cr ? `${fn} ${ln}, ${cr}` : `${fn} ${ln}`
    trainerCertNumber   = ts.certification_number ?? ''
    trainerSignatureUrl = ts.signature_url ?? null
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
  const staffCreds = staff.credentials?.trim()
  const staffName  = staffCreds
    ? `${staff.first_name} ${staff.last_name}, ${staffCreds}`
    : `${staff.first_name} ${staff.last_name}`

  const eventDate = course.date
    ? new Date(course.date + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : ''

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
  switch (template) {
    case 'formal': pdfBytes = await generateFormal(certData); break
    case 'fun':    pdfBytes = await generateFun(certData);    break
    case 'basic':  pdfBytes = await generateBasic(certData);  break
    default:       pdfBytes = await generateBacb(certData);   break
  }

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
