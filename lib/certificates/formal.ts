/**
 * Formal Template — diploma-style certificate
 * Cream background · navy & gold borders · serif fonts · two-column signature footer
 */
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'
import fs from 'fs'
import type { CertData } from './types'
import { top, wrapText, centerX, embedJpgFromUrl, embedPngFromUrl } from './utils'

const W = 612, H = 792

const NAVY  = rgb(0.04, 0.15, 0.27)
const GOLD  = rgb(0.68, 0.52, 0.08)
const CREAM = rgb(1, 1, 1)
const BLACK = rgb(0.10, 0.10, 0.10)
const GRAY  = rgb(0.50, 0.50, 0.50)

export async function generateFormal(data: CertData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page   = pdfDoc.addPage([W, H])
  const T = (y: number) => top(H, y)

  const serif     = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const serifItal = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic)
  const serifBI   = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic)
  const sans      = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // ── Background ──────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM })

  // ── Outer navy border ────────────────────────────────────────────────────────
  const B1 = 16
  page.drawRectangle({ x: B1, y: B1, width: W - 2*B1, height: H - 2*B1,
    borderColor: NAVY, borderWidth: 2.5, color: CREAM })

  // ── Inner gold border ────────────────────────────────────────────────────────
  const B2 = 24
  page.drawRectangle({ x: B2, y: B2, width: W - 2*B2, height: H - 2*B2,
    borderColor: GOLD, borderWidth: 1, color: CREAM })

  // ── Corner gold diamonds ─────────────────────────────────────────────────────
  const CS = 7
  for (const [cx, cy] of [
    [B2 + 6, B2 + 6], [W - B2 - 6 - CS, B2 + 6],
    [B2 + 6, H - B2 - 6 - CS], [W - B2 - 6 - CS, H - B2 - 6 - CS],
  ]) {
    page.drawRectangle({ x: cx, y: cy, width: CS, height: CS, color: GOLD,
      rotate: degrees(45) })
  }

  let curY = 44 // distance from top of page

  // ── Company logo (if available) ──────────────────────────────────────────────
  if (data.companyLogoUrl) {
    const img = await embedJpgFromUrl(pdfDoc, data.companyLogoUrl)
    if (img) {
      const dims = img.scaleToFit(110, 55)
      page.drawImage(img, { x: W/2 - dims.width/2, y: T(curY + dims.height), width: dims.width, height: dims.height })
      curY += dims.height + 14
    }
  }

  // ── Gold rule + title ────────────────────────────────────────────────────────
  page.drawLine({ start: { x: 72, y: T(curY + 6) }, end: { x: W - 72, y: T(curY + 6) }, color: GOLD, thickness: 1.5 })
  curY += 20

  const title = 'CERTIFICATE OF COMPLETION'
  const titleSz = 24
  page.drawText(title, { x: centerX(title, serifBold, titleSz, W), y: T(curY + titleSz), font: serifBold, size: titleSz, color: NAVY })
  curY += titleSz + 8

  page.drawLine({ start: { x: 72, y: T(curY + 4) }, end: { x: W - 72, y: T(curY + 4) }, color: GOLD, thickness: 1.5 })
  curY += 22

  // ── "This is to certify that" ────────────────────────────────────────────────
  const pre = 'This is to certify that'
  page.drawText(pre, { x: centerX(pre, serifItal, 13, W), y: T(curY + 13), font: serifItal, size: 13, color: BLACK })
  curY += 28

  // ── Staff name ───────────────────────────────────────────────────────────────
  const nameSz = 30
  const nameLines = wrapText(data.staffName, serifBI, nameSz, W - 140)
  for (const line of nameLines) {
    page.drawText(line, { x: centerX(line, serifBI, nameSz, W), y: T(curY + nameSz), font: serifBI, size: nameSz, color: NAVY })
    curY += nameSz + 4
  }
  // Underline
  page.drawLine({ start: { x: W/2 - 120, y: T(curY + 4) }, end: { x: W/2 + 120, y: T(curY + 4) }, color: GOLD, thickness: 0.75 })
  curY += 18

  // ── "has successfully completed" ─────────────────────────────────────────────
  const mid = 'has successfully completed the in-service training'
  page.drawText(mid, { x: centerX(mid, serifItal, 13, W), y: T(curY + 13), font: serifItal, size: 13, color: BLACK })
  curY += 26

  // ── Training name ────────────────────────────────────────────────────────────
  const trnSz = 17
  const trnLines = wrapText(data.trainingName, serifBold, trnSz, W - 120)
  for (const line of trnLines) {
    page.drawText(line, { x: centerX(line, serifBold, trnSz, W), y: T(curY + trnSz), font: serifBold, size: trnSz, color: NAVY })
    curY += trnSz + 5
  }
  curY += 6

  // ── Gold divider ─────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: 72, y: T(curY) }, end: { x: W - 72, y: T(curY) }, color: GOLD, thickness: 0.75 })
  curY += 20

  // ── Detail row: Date | PDUs | Modality ───────────────────────────────────────
  const labelSz = 7.5
  const valSz   = 12
  const cols = [
    { label: 'DATE OF COMPLETION', value: data.eventDate || '—', x: 130 },
    { label: 'CONTINUING EDUCATION UNITS', value: `${data.pduCount} PDUs`, x: W / 2 },
    { label: 'FORMAT', value: data.modality || '—', x: W - 130 },
  ]
  for (const { label, value, x } of cols) {
    page.drawText(label, { x: x - serif.widthOfTextAtSize(label, labelSz) / 2, y: T(curY + labelSz), font: serif, size: labelSz, color: GRAY })
    page.drawText(value, { x: x - serifBold.widthOfTextAtSize(value, valSz) / 2, y: T(curY + labelSz + 2 + valSz), font: serifBold, size: valSz, color: BLACK })
  }
  curY += labelSz + valSz + 18

  // ── Trainer / org info ───────────────────────────────────────────────────────
  const infoSz = 10.5
  const infoLines: string[] = []
  infoLines.push(`Trainer: ${data.trainerName}${data.trainerCertNumber ? `  ·  BACB #${data.trainerCertNumber}` : ''}`)
  infoLines.push(`Organization: ${data.companyName}`)
  if (data.orgContactName) infoLines.push(`Organization Contact: ${data.orgContactName}${data.orgContactCertNumber ? `  ·  BACB #${data.orgContactCertNumber}` : ''}`)
  if (data.certNumber)     infoLines.push(`RBT BACB Certification #: ${data.certNumber}`)

  for (const line of infoLines) {
    const shortened = serif.widthOfTextAtSize(line, infoSz) > W - 100
      ? (() => { let s = line; while (serif.widthOfTextAtSize(s + '…', infoSz) > W - 100 && s.length > 10) s = s.slice(0, -1); return s + '…' })()
      : line
    page.drawText(shortened, { x: centerX(shortened, serif, infoSz, W), y: T(curY + infoSz), font: serif, size: infoSz, color: BLACK })
    curY += infoSz + 5
  }
  curY += 8

  // ── Gold divider before signature ────────────────────────────────────────────
  page.drawLine({ start: { x: 72, y: T(curY) }, end: { x: W - 72, y: T(curY) }, color: GOLD, thickness: 0.75 })
  curY += 16

  // ── Signature (left) + Date (right) ─────────────────────────────────────────
  const sigBoxH = 50
  const sigLineY = curY + sigBoxH

  if (data.trainerSignatureUrl) {
    const sigImg = await embedPngFromUrl(pdfDoc, data.trainerSignatureUrl)
    if (sigImg) {
      const dims = sigImg.scaleToFit(180, sigBoxH)
      page.drawImage(sigImg, { x: 80, y: T(curY + dims.height + 4), width: dims.width, height: dims.height })
    }
  }
  page.drawLine({ start: { x: 78, y: T(sigLineY) }, end: { x: 288, y: T(sigLineY) }, color: BLACK, thickness: 0.5 })
  page.drawText('Authorized Signature', { x: centerX('Authorized Signature', serif, 8, 210) + 78, y: T(sigLineY + 12), font: serif, size: 8, color: GRAY })

  // Date right column
  page.drawLine({ start: { x: 324, y: T(sigLineY) }, end: { x: 534, y: T(sigLineY) }, color: BLACK, thickness: 0.5 })
  page.drawText(data.eventDate || '—', { x: centerX(data.eventDate || '—', serifBold, 12, 210) + 324, y: T(sigLineY - 4), font: serifBold, size: 12, color: BLACK })
  page.drawText('Date', { x: centerX('Date', serif, 8, 210) + 324, y: T(sigLineY + 12), font: serif, size: 8, color: GRAY })

  curY = sigLineY + 20

  // ── Footer logos — sit inside the gold inner border (B2=24 from edge) ────────
  const FOOT_Y    = B2 + 28   // clear the gold border with a little breathing room
  const narwhalSz = 5.5

  // Narwhal logo bottom-right
  try {
    const nBytes = fs.readFileSync(data.narwhalLogoPath)
    const nImg   = await pdfDoc.embedJpg(nBytes)
    const nDims  = nImg.scaleToFit(54, 42)
    const nx     = W - B2 - 10 - nDims.width
    page.drawImage(nImg, { x: nx, y: FOOT_Y + 14, width: nDims.width, height: nDims.height })
    const nt1 = 'Generated Using', nt2 = 'NarwhalTracker.com'
    const ncx = nx + nDims.width / 2
    page.drawText(nt1, { x: ncx - sans.widthOfTextAtSize(nt1, narwhalSz)/2, y: FOOT_Y + 8, font: sans, size: narwhalSz, color: GRAY })
    page.drawText(nt2, { x: ncx - sans.widthOfTextAtSize(nt2, narwhalSz)/2, y: FOOT_Y + 2, font: sans, size: narwhalSz, color: GRAY })
  } catch { /* best-effort */ }

  // Company logo bottom-left
  if (data.companyLogoUrl) {
    const cImg = await embedJpgFromUrl(pdfDoc, data.companyLogoUrl)
    if (cImg) {
      const cDims = cImg.scaleToFit(81, 52)
      page.drawImage(cImg, { x: B2 + 10, y: FOOT_Y, width: cDims.width, height: cDims.height })
    }
  }

  return pdfDoc.save()
}
