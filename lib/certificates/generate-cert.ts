import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import type { CertData } from './types'
import { generateFormal } from './formal'
import { generateFun }    from './fun'
import { generateBasic }  from './basic'

// ─── Constants ───────────────────────────────────────────────────────────────

export const MODALITY_LABELS: Record<string, string> = {
  'in-person':           'In-person',
  'online-synchronous':  'Online synchronous',
  'online-asynchronous': 'Online asynchronous',
}

// ─── BACB fillable template ──────────────────────────────────────────────────

export async function generateBacb(data: CertData): Promise<Uint8Array> {
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

// ─── Template router ─────────────────────────────────────────────────────────

export async function generateCertPdf(data: CertData, template: string): Promise<Uint8Array> {
  switch (template) {
    case 'formal': return generateFormal(data)
    case 'fun':    return generateFun(data)
    case 'basic':  return generateBasic(data)
    default:       return generateBacb(data)
  }
}

/**
 * Pick a template honoring the caller's request, the company's preferred
 * default, and the company's enabled whitelist. Always returns a valid
 * entry from `enabled` (or 'bacb' if the list is empty).
 */
export function resolveTemplate(
  requested: string | null | undefined,
  enabled:   string[],
  preferred: string | null | undefined,
): string {
  const choice = requested || preferred || 'bacb'
  if (enabled.includes(choice)) return choice
  return enabled[0] ?? 'bacb'
}

// ─── Filenames ───────────────────────────────────────────────────────────────

export function certFilename(staffName: string, courseDate: string | null): string {
  const safeStaffName = staffName.replace(/[^a-zA-Z0-9]/g, '-')
  const safeDateStr   = (courseDate ?? 'undated').replace(/-/g, '')
  return `RBT-InService-${safeStaffName}-${safeDateStr}.pdf`
}

// ─── Cert data builder ───────────────────────────────────────────────────────

type RecordShape = {
  staff: {
    first_name: string
    last_name:  string
    display_first_name: string | null
    display_last_name:  string | null
    certification_number: string | null
    credentials: string | null
  }
  courses: {
    name: string
    date: string | null
    modality: string | null
    units: number | null
    trainer_staff_id:  string | null
    trainer_name:      string | null
    trainer_cert_number: string | null
    trainer_staff: {
      first_name: string
      last_name:  string
      display_first_name: string | null
      display_last_name:  string | null
      certification_number: string | null
      signature_url: string | null
      credentials: string | null
    } | null
  }
}

export type OrgContact = { name: string; certNumber: string } | null

export function buildCertData(
  record:  RecordShape,
  company: { name: string; logoUrl: string | null },
  orgContact: OrgContact,
): CertData & { staffName: string; courseDate: string | null } {
  const staff  = record.staff
  const course = record.courses

  // Trainer
  let trainerName         = course.trainer_name        ?? ''
  let trainerCertNumber   = course.trainer_cert_number ?? ''
  let trainerSignatureUrl: string | null = null
  if (course.trainer_staff_id && course.trainer_staff) {
    const ts = course.trainer_staff
    const fn = ts.display_first_name?.trim() || ts.first_name
    const ln = ts.display_last_name?.trim()  || ts.last_name
    const cr = ts.credentials?.trim()
    trainerName         = cr ? `${fn} ${ln}, ${cr}` : `${fn} ${ln}`
    trainerCertNumber   = ts.certification_number ?? ''
    trainerSignatureUrl = ts.signature_url ?? null
  }

  // Staff name
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
    trainingName:         course.name ?? '',
    eventDate,
    pduCount:             course.units != null ? String(course.units) : '',
    modality:             MODALITY_LABELS[course.modality ?? ''] ?? course.modality ?? '',
    trainerName,
    trainerCertNumber,
    companyName:          company.name,
    orgContactName:       orgContact?.name ?? '',
    orgContactCertNumber: orgContact?.certNumber ?? '',
    trainerSignatureUrl,
    companyLogoUrl:       company.logoUrl,
    narwhalLogoPath:      path.join(process.cwd(), 'public', 'narwhal-tracker.jpg'),
  }

  return { ...certData, staffName, courseDate: course.date }
}
