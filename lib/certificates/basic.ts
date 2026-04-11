/**
 * Basic Template — clean, modern, professional
 * Navy top bar · white body · two-tone grey field labels · simple grid layout
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import type { CertData } from './types'
import { top, wrapText, centerX, embedJpgFromUrl, embedPngFromUrl } from './utils'

const W = 612, H = 792

const NAVY    = rgb(0.04, 0.15, 0.27)
const ACCENT  = rgb(0.11, 0.55, 0.73)   // steel blue accent
const WHITE   = rgb(1, 1, 1)
const BLACK   = rgb(0.10, 0.10, 0.10)
const GRAY    = rgb(0.50, 0.50, 0.50)
const LGRAY   = rgb(0.94, 0.95, 0.96)

export async function generateBasic(data: CertData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page   = pdfDoc.addPage([W, H])
  const T = (y: number) => top(H, y)

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  // oblique available if needed

  // ── White background ─────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: WHITE })

  // ── Navy top bar ─────────────────────────────────────────────────────────────
  const BAR_H = 72
  page.drawRectangle({ x: 0, y: T(BAR_H), width: W, height: BAR_H, color: NAVY })

  // ── Accent stripe below bar ───────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: T(BAR_H + 6), width: W, height: 6, color: ACCENT })

  // ── Bar title text ────────────────────────────────────────────────────────────
  const barTitle = 'CERTIFICATE OF COMPLETION'
  const barSz    = 20
  page.drawText(barTitle, {
    x: centerX(barTitle, bold, barSz, W),
    y: T(BAR_H / 2 + barSz / 2),
    font: bold, size: barSz, color: WHITE,
  })

  // ── Company logo inside bar (left) ───────────────────────────────────────────
  if (data.companyLogoUrl) {
    const img = await embedJpgFromUrl(pdfDoc, data.companyLogoUrl)
    if (img) {
      const dims = img.scaleToFit(90, 50)
      page.drawImage(img, { x: 24, y: T(BAR_H / 2 + dims.height / 2), width: dims.width, height: dims.height })
    }
  }

  let curY = BAR_H + 18

  // ── "Awarded to" label ───────────────────────────────────────────────────────
  const awardedSz = 9
  const awardedText = 'AWARDED TO'
  page.drawText(awardedText, {
    x: centerX(awardedText, bold, awardedSz, W),
    y: T(curY + awardedSz),
    font: bold, size: awardedSz, color: ACCENT,
  })
  curY += awardedSz + 8

  // ── Staff name ───────────────────────────────────────────────────────────────
  const nameSz = 30
  const nameLines = wrapText(data.staffName, bold, nameSz, W - 80)
  for (const line of nameLines) {
    page.drawText(line, { x: centerX(line, bold, nameSz, W), y: T(curY + nameSz), font: bold, size: nameSz, color: NAVY })
    curY += nameSz + 4
  }

  // ── RBT cert # under name ────────────────────────────────────────────────────
  if (data.certNumber) {
    const rbtSz   = 9
    const rbtText = `RBT BACB Certification #${data.certNumber}`
    page.drawText(rbtText, { x: centerX(rbtText, regular, rbtSz, W), y: T(curY + rbtSz), font: regular, size: rbtSz, color: GRAY })
    curY += rbtSz + 4
  }
  curY += 8

  // ── Full-width divider ────────────────────────────────────────────────────────
  page.drawRectangle({ x: 36, y: T(curY), width: W - 72, height: 1, color: LGRAY })
  curY += 16

  // ── Training name ────────────────────────────────────────────────────────────
  const trnLblSz = 8
  const trnLbl   = 'TRAINING'
  page.drawText(trnLbl, { x: 36, y: T(curY + trnLblSz), font: bold, size: trnLblSz, color: ACCENT })
  curY += trnLblSz + 4

  const trnSz    = 16
  const trnLines = wrapText(data.trainingName, bold, trnSz, W - 72)
  for (const line of trnLines) {
    page.drawText(line, { x: 36, y: T(curY + trnSz), font: bold, size: trnSz, color: BLACK })
    curY += trnSz + 4
  }
  curY += 12

  // ── 3-column detail grid ──────────────────────────────────────────────────────
  const COL_W  = (W - 72) / 3
  const COLS   = [
    { label: 'DATE', value: data.eventDate || '—' },
    { label: 'PDUs', value: `${data.pduCount}` },
    { label: 'FORMAT', value: data.modality || '—' },
  ]
  const cellH  = 48
  const cellSz = 14, cellLblSz = 8

  COLS.forEach(({ label, value }, i) => {
    const cx = 36 + i * COL_W
    // Cell background alternating
    page.drawRectangle({ x: cx, y: T(curY + cellH), width: COL_W, height: cellH,
      color: i % 2 === 0 ? LGRAY : WHITE, borderColor: LGRAY, borderWidth: 1 })
    page.drawText(label, { x: cx + 8, y: T(curY + cellLblSz + 4), font: bold, size: cellLblSz, color: ACCENT })
    const dispVal = bold.widthOfTextAtSize(value, cellSz) > COL_W - 16
      ? (() => { let s = value; while (bold.widthOfTextAtSize(s + '…', cellSz) > COL_W - 16) s = s.slice(0, -1); return s + '…' })()
      : value
    page.drawText(dispVal, { x: cx + 8, y: T(curY + cellLblSz + 4 + cellSz + 4), font: bold, size: cellSz, color: NAVY })
  })
  curY += cellH + 16

  // ── 2-column detail grid: Trainer | Organization ──────────────────────────────
  const col2W = (W - 72) / 2
  const pairs: Array<[string, string]> = [
    ['TRAINER', data.trainerName || '—'],
    ['ORGANIZATION', data.companyName || '—'],
  ]
  if (data.trainerCertNumber || data.orgContactName) {
    pairs.push(
      ['TRAINER BACB #', data.trainerCertNumber || '—'],
      ['ORG CONTACT', data.orgContactName ? `${data.orgContactName}${data.orgContactCertNumber ? ` · BACB #${data.orgContactCertNumber}` : ''}` : '—'],
    )
  }

  for (let i = 0; i < pairs.length; i += 2) {
    const rowH = 42
    for (let j = 0; j < 2 && i + j < pairs.length; j++) {
      const [label, value] = pairs[i + j]
      const cx = 36 + j * col2W
      page.drawRectangle({ x: cx, y: T(curY + rowH), width: col2W, height: rowH,
        color: (i + j) % 4 < 2 ? WHITE : LGRAY, borderColor: LGRAY, borderWidth: 1 })
      page.drawText(label, { x: cx + 8, y: T(curY + cellLblSz + 4), font: bold, size: cellLblSz, color: ACCENT })
      const shortened = regular.widthOfTextAtSize(value, 11) > col2W - 16
        ? (() => { let s = value; while (regular.widthOfTextAtSize(s + '…', 11) > col2W - 16) s = s.slice(0, -1); return s + '…' })()
        : value
      page.drawText(shortened, { x: cx + 8, y: T(curY + cellLblSz + 4 + 13), font: regular, size: 11, color: BLACK })
    }
    curY += rowH
  }
  curY += 16

  // ── Full-width divider ────────────────────────────────────────────────────────
  page.drawRectangle({ x: 36, y: T(curY), width: W - 72, height: 1, color: LGRAY })
  curY += 16

  // ── Signature + Date row ─────────────────────────────────────────────────────
  const sigAreaH = 56

  if (data.trainerSignatureUrl) {
    const sigImg = await embedPngFromUrl(pdfDoc, data.trainerSignatureUrl)
    if (sigImg) {
      const dims = sigImg.scaleToFit(180, sigAreaH - 10)
      page.drawImage(sigImg, { x: 40, y: T(curY + dims.height + 6), width: dims.width, height: dims.height })
    }
  }
  // Sig line + label
  page.drawRectangle({ x: 36, y: T(curY + sigAreaH), width: 220, height: 2, color: ACCENT })
  page.drawText('Authorized Signature', { x: 36, y: T(curY + sigAreaH + 12), font: regular, size: 8, color: GRAY })

  // Date block on right
  const dateBoxX = W - 36 - 160
  page.drawRectangle({ x: dateBoxX, y: T(curY + sigAreaH), width: 160, height: sigAreaH, color: NAVY })
  page.drawText('DATE', { x: dateBoxX + 8, y: T(curY + 12), font: bold, size: 8, color: rgb(0.6, 0.75, 0.85) })
  const dateVal = data.eventDate || '—'
  page.drawText(dateVal, {
    x: dateBoxX + 160/2 - bold.widthOfTextAtSize(dateVal, 14)/2,
    y: T(curY + 36), font: bold, size: 14, color: WHITE,
  })

  curY += sigAreaH + 16

  // ── Footer logos ─────────────────────────────────────────────────────────────
  const FOOT_Y = 10
  const narwhalSz = 5.5

  try {
    const nBytes = fs.readFileSync(data.narwhalLogoPath)
    const nImg   = await pdfDoc.embedJpg(nBytes)
    const nDims  = nImg.scaleToFit(54, 40)
    const nx     = W - 36 - nDims.width
    page.drawImage(nImg, { x: nx, y: FOOT_Y + 14, width: nDims.width, height: nDims.height })
    const ncx = nx + nDims.width / 2
    for (const [txt, dy] of [['Generated Using', 9], ['NarwhalTracker.com', 3]] as [string, number][]) {
      page.drawText(txt, { x: ncx - regular.widthOfTextAtSize(txt, narwhalSz)/2, y: FOOT_Y + dy, font: regular, size: narwhalSz, color: GRAY })
    }
  } catch { /* best-effort */ }

  if (data.companyLogoUrl) {
    const cImg = await embedJpgFromUrl(pdfDoc, data.companyLogoUrl)
    if (cImg) {
      const cDims = cImg.scaleToFit(81, 50)
      page.drawImage(cImg, { x: 36, y: FOOT_Y, width: cDims.width, height: cDims.height })
    }
  }

  return pdfDoc.save()
}
