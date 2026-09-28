import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CertData } from './types'
import { generateFormal } from './formal'
import { generateFun }    from './fun'
import { generateBasic }  from './basic'
export { CERT_TEMPLATES, type CertTemplate } from './templates'
import type { CertTemplate } from './templates'

export const MODALITY_LABELS: Record<string, string> = {
  'in-person':           'In-person',
  'online-synchronous':  'Online synchronous',
  'online-asynchronous': 'Online asynchronous',
}

// Cache the BACB fillable PDF bytes so a bulk ZIP of N certs only
// reads the file once. The file lives in the app bundle and never
// changes at runtime.
let _bacbTemplateBytes: Buffer | null = null
function bacbTemplateBytes(): Buffer {
  if (!_bacbTemplateBytes) {
    _bacbTemplateBytes = fs.readFileSync(
      path.join(process.cwd(), 'public', 'templates', 'rbt-inservice-template.pdf'),
    )
  }
  return _bacbTemplateBytes
}

export async function generateBacb(data: CertData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bacbTemplateBytes())
  const form   = pdfDoc.getForm()

  form.getTextField('RBT Name').setText(data.staffName)
  form.getTextField('RBT BACB Certification Number').setText(data.certNumber)
  form.getTextField('Event Name').setText(data.trainingName)
  form.getTextField('Event Date').setText(data.eventDate)
  form.getTextField('Total Number of PDUs').setText(data.unitCount)
  form.getTextField('Organization Name').setText(data.companyName)
  form.getTextField('In-Service Trainer Name').setText(data.trainerName)
  form.getTextField('In-Service Trainer BACB Certification Number').setText(data.trainerCertNumber)

  // Optional fields — older BACB template revisions don't have them.
  if (data.orgContactName) {
    try { form.getTextField('In-Service Organization Contact Name').setText(data.orgContactName) } catch { /* ignore */ }
  }
  if (data.orgContactCertNumber) {
    try { form.getTextField('In-Service Organization Contact BACB Certification Number').setText(data.orgContactCertNumber) } catch { /* ignore */ }
  }

  if (data.modality) {
    try { form.getDropdown('Event Modality').select(data.modality) } catch { /* ignore */ }
  }

  form.getTextField('Signature Date').setText(data.eventDate)

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

export async function generateCertPdf(data: CertData, template: CertTemplate): Promise<Uint8Array> {
  switch (template) {
    case 'formal': return generateFormal(data)
    case 'fun':    return generateFun(data)
    case 'basic':  return generateBasic(data)
    case 'bacb':   return generateBacb(data)
  }
}

/**
 * Pick a template honoring the caller's request, the company's preferred
 * default, and the company's enabled whitelist. Always returns a valid
 * entry from `enabled` (or 'bacb' if the list is empty).
 *
 * The BACB form is the RBT in-service form, so anyone else (e.g. a BCBA)
 * gets the company's first other enabled template, or Basic.
 */
export function resolveTemplate(
  requested: string | null | undefined,
  enabled:   string[],
  preferred: string | null | undefined,
  credentialCode: string,
): CertTemplate {
  const choice = (requested || preferred || 'bacb') as CertTemplate
  const picked = enabled.includes(choice) ? choice : ((enabled[0] as CertTemplate) ?? 'bacb')
  if (picked !== 'bacb' || credentialCode === 'RBT') return picked
  return (enabled.find(t => t !== 'bacb') as CertTemplate | undefined) ?? 'basic'
}

export function certFilename(staffName: string, courseDate: string | null, credentialCode: string): string {
  const safeStaffName = staffName.replace(/[^a-zA-Z0-9]/g, '-')
  const safeDateStr   = (courseDate ?? 'undated').replace(/-/g, '')
  const prefix        = credentialCode === 'RBT' ? 'RBT-InService' : `${credentialCode}-CE`
  return `${prefix}-${safeStaffName}-${safeDateStr}.pdf`
}

export type CertCredential = { code: string; unitLabel: string }

/**
 * Loads credential_types once so a caller generating many certificates can
 * resolve each learner's credential without a query per record.
 */
export async function loadCredentialLookup(
  service: SupabaseClient,
): Promise<(role: string | null | undefined) => CertCredential> {
  const { data } = await service.from('credential_types').select('code, unit_label')
  const byCode = new Map((data ?? []).map(c => [c.code.toUpperCase(), c.unit_label as string]))
  // People with no credential (e.g. a trainer who attended) get RBT/PDU
  // wording, which is what every certificate said before BCBAs existed.
  return role => {
    const code = role?.toUpperCase() ?? ''
    const unitLabel = byCode.get(code)
    return unitLabel ? { code, unitLabel } : { code: 'RBT', unitLabel: 'PDU' }
  }
}

export type RecordShape = {
  completed_date: string | null
  staff: {
    role: string | null
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

/**
 * Builds the `CertData` used by every template generator, plus the raw
 * effective date (needed by callers to name files).
 */
export function buildCertData(
  record:  RecordShape,
  company: { name: string; logoUrl: string | null },
  orgContact: OrgContact,
  credential: CertCredential,
): { cert: CertData; courseDate: string | null } {
  const staff  = record.staff
  const course = record.courses

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

  const staffCreds = staff.credentials?.trim()
  const staffName  = staffCreds
    ? `${staff.first_name} ${staff.last_name}, ${staffCreds}`
    : `${staff.first_name} ${staff.last_name}`

  // Live trainings happen on a scheduled date shared by every attendee.
  // Self-paced courses have no such date — the meaningful "event date" is
  // the day this particular person completed it, which differs per learner.
  const effectiveDate = course.date ?? record.completed_date
  const eventDate = effectiveDate
    ? new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : ''

  const cert: CertData = {
    staffName,
    certNumber:           staff.certification_number ?? '',
    trainingName:         course.name ?? '',
    eventDate,
    unitCount:            course.units != null ? String(course.units) : '',
    unitLabel:            credential.unitLabel,
    credentialCode:       credential.code,
    modality:             MODALITY_LABELS[course.modality ?? ''] ?? course.modality ?? '',
    trainerName,
    trainerCertNumber,
    companyName:          company.name,
    orgContactName:       orgContact?.name ?? '',
    orgContactCertNumber: orgContact?.certNumber ?? '',
    trainerSignatureUrl,
    companyLogoUrl:       company.logoUrl,
    brandLogoPath:      path.join(process.cwd(), 'public', 'training-loop-logo.png'),
  }

  return { cert, courseDate: effectiveDate }
}
