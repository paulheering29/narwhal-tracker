/**
 * Fun Template — bright, celebratory, playful
 * Teal/coral palette · big name display · colorful badge pills for details
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import type { CertData } from './types'
import { top, wrapText, centerX, embedJpgFromUrl, embedPngFromUrl } from './utils'

const W = 612, H = 792

const TEAL   = rgb(0.11, 0.63, 0.57)   // #1CA191
const CORAL  = rgb(0.94, 0.38, 0.26)   // #F06142
const YELLOW = rgb(0.98, 0.79, 0.10)   // #FAC91A
const PURPLE = rgb(0.42, 0.27, 0.72)   // #6B45B8
const WHITE  = rgb(1, 1, 1)
const BLACK  = rgb(0.12, 0.12, 0.12)
const GRAY   = rgb(0.50, 0.50, 0.50)

export async function generateFun(data: CertData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page   = pdfDoc.addPage([W, H])
  const T = (y: number) => top(H, y)

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  // oblique available if needed for future use

  // ── White background ─────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: WHITE })

  // ── Teal header band ─────────────────────────────────────────────────────────
  const HEADER_H = 160
  page.drawRectangle({ x: 0, y: T(HEADER_H), width: W, height: HEADER_H, color: TEAL })

  // ── Decorative circles in header (playful background dots) ───────────────────
  const circles = [
    { x: 30,  y: T(30),  r: 18, c: YELLOW },
    { x: 580, y: T(20),  r: 12, c: CORAL  },
    { x: 560, y: T(80),  r: 22, c: YELLOW },
    { x: 55,  y: T(110), r: 10, c: WHITE  },
    { x: 520, y: T(140), r: 8,  c: WHITE  },
    { x: 80,  y: T(65),  r: 6,  c: CORAL  },
  ]
  for (const { x, y, r, c } of circles) {
    page.drawCircle({ x, y, size: r, color: c, opacity: 0.35 })
  }

  // ── Coral accent stripe below header ─────────────────────────────────────────
  page.drawRectangle({ x: 0, y: T(HEADER_H + 10), width: W, height: 10, color: CORAL })

  // ── Company logo inside header top-left ──────────────────────────────────────
  if (data.companyLogoUrl) {
    const img = await embedJpgFromUrl(pdfDoc, data.companyLogoUrl)
    if (img) {
      const dims = img.scaleToFit(90, 45)
      page.drawImage(img, { x: 28, y: T(22 + dims.height), width: dims.width, height: dims.height })
    }
  }

  // ── Stars drawn as simple polygons (using circles as proxies) ────────────────
  for (const { x, y } of [{ x: 48, y: T(130) }, { x: 570, y: T(50) }, { x: 300, y: T(10) }]) {
    page.drawCircle({ x, y, size: 5, color: YELLOW, opacity: 0.7 })
  }

  // ── Header text ──────────────────────────────────────────────────────────────
  const hdr1 = 'Training Complete!'
  const hdr1Sz = 28
  page.drawText(hdr1, { x: centerX(hdr1, bold, hdr1Sz, W), y: T(55 + hdr1Sz), font: bold, size: hdr1Sz, color: WHITE })

  const hdr2 = 'CERTIFICATE OF COMPLETION'
  const hdr2Sz = 11
  page.drawText(hdr2, { x: centerX(hdr2, regular, hdr2Sz, W), y: T(90 + hdr2Sz), font: regular, size: hdr2Sz, color: rgb(0.8, 0.97, 0.95) })

  let curY = HEADER_H + 28

  // ── "Presented to" ───────────────────────────────────────────────────────────
  const presText = 'Presented to'
  page.drawText(presText, { x: centerX(presText, regular, 11, W), y: T(curY + 11), font: regular, size: 11, color: GRAY })
  curY += 22

  // ── Staff name ───────────────────────────────────────────────────────────────
  const nameSz = 32
  const nameLines = wrapText(data.staffName, bold, nameSz, W - 80)
  for (const line of nameLines) {
    page.drawText(line, { x: centerX(line, bold, nameSz, W), y: T(curY + nameSz), font: bold, size: nameSz, color: TEAL })
    curY += nameSz + 4
  }
  // Yellow underline
  const nameLineW = Math.min(bold.widthOfTextAtSize(data.staffName, nameSz) + 20, W - 80)
  page.drawRectangle({ x: W/2 - nameLineW/2, y: T(curY + 4), width: nameLineW, height: 4, color: YELLOW })
  curY += 20

  // ── Training name ────────────────────────────────────────────────────────────
  const trnSz = 15
  const trnLines = wrapText(data.trainingName, bold, trnSz, W - 100)
  for (const line of trnLines) {
    page.drawText(line, { x: centerX(line, bold, trnSz, W), y: T(curY + trnSz), font: bold, size: trnSz, color: BLACK })
    curY += trnSz + 5
  }
  curY += 12

  // ── Colourful badge pills: Date | PDUs | Modality ────────────────────────────
  const badges = [
    { label: 'DATE', value: data.eventDate || '—', color: TEAL },
    { label: 'PDUs', value: `${data.pduCount}`, color: CORAL },
    { label: 'FORMAT', value: data.modality || '—', color: PURPLE },
  ]
  const pillW = 158, pillH = 46, pillGap = 12
  const totalPillW = badges.length * pillW + (badges.length - 1) * pillGap
  let pillX = (W - totalPillW) / 2

  for (const { label, value, color } of badges) {
    // Pill background
    page.drawRectangle({ x: pillX, y: T(curY + pillH), width: pillW, height: pillH,
      color })
    // Label
    const lblSz = 7.5
    page.drawText(label, {
      x: pillX + pillW/2 - regular.widthOfTextAtSize(label, lblSz)/2,
      y: T(curY + 14), font: regular, size: lblSz, color: rgb(0.9, 0.97, 1),
    })
    // Value
    const valSz = 14
    const dispValue = bold.widthOfTextAtSize(value, valSz) > pillW - 16
      ? (() => { let s = value; while (bold.widthOfTextAtSize(s + '…', valSz) > pillW - 16) s = s.slice(0, -1); return s + '…' })()
      : value
    page.drawText(dispValue, {
      x: pillX + pillW/2 - bold.widthOfTextAtSize(dispValue, valSz)/2,
      y: T(curY + 32), font: bold, size: valSz, color: WHITE,
    })
    pillX += pillW + pillGap
  }
  curY += pillH + 22

  // ── Info block (white card with teal left border) ────────────────────────────
  const cardX = 52, cardW = W - 104, cardPad = 14
  const infoLines: Array<[string, string]> = [
    ['Trainer',      `${data.trainerName}${data.trainerCertNumber ? ` · BACB #${data.trainerCertNumber}` : ''}`],
    ['Organization', data.companyName],
  ]
  if (data.orgContactName) infoLines.push(['Org Contact', `${data.orgContactName}${data.orgContactCertNumber ? ` · BACB #${data.orgContactCertNumber}` : ''}`])
  if (data.certNumber)     infoLines.push(['RBT BACB #', data.certNumber])

  const infoRowH = 18
  const cardH    = cardPad + infoLines.length * infoRowH + cardPad
  page.drawRectangle({ x: cardX, y: T(curY + cardH), width: cardW, height: cardH,
    color: rgb(0.96, 0.98, 0.99), borderColor: rgb(0.85, 0.90, 0.92), borderWidth: 1 })
  page.drawRectangle({ x: cardX, y: T(curY + cardH), width: 4, height: cardH, color: TEAL })

  let iy = curY + cardPad
  const labelSz = 8, valSzInfo = 11
  for (const [label, value] of infoLines) {
    page.drawText(label.toUpperCase(), { x: cardX + 14, y: T(iy + labelSz), font: regular, size: labelSz, color: TEAL })
    const shortened = bold.widthOfTextAtSize(value, valSzInfo) > cardW - 90
      ? (() => { let s = value; while (bold.widthOfTextAtSize(s + '…', valSzInfo) > cardW - 90) s = s.slice(0, -1); return s + '…' })()
      : value
    page.drawText(shortened, { x: cardX + 90, y: T(iy + labelSz), font: bold, size: valSzInfo, color: BLACK })
    iy += infoRowH
  }
  curY += cardH + 20

  // ── Signature row ────────────────────────────────────────────────────────────
  const sigH = 48

  if (data.trainerSignatureUrl) {
    const sigImg = await embedPngFromUrl(pdfDoc, data.trainerSignatureUrl)
    if (sigImg) {
      const dims = sigImg.scaleToFit(170, sigH)
      page.drawImage(sigImg, { x: cardX + 10, y: T(curY + dims.height + 6), width: dims.width, height: dims.height })
    }
  }
  // Teal line under sig
  page.drawRectangle({ x: cardX, y: T(curY + sigH + 4), width: 200, height: 3, color: TEAL })
  page.drawText('Authorized Signature', { x: cardX + 4, y: T(curY + sigH + 16), font: regular, size: 8, color: GRAY })

  // Date pill right
  const datePillW = 140, datePillH = 32
  const datePillX = W - cardX - datePillW
  page.drawRectangle({ x: datePillX, y: T(curY + sigH), width: datePillW, height: datePillH, color: TEAL })
  page.drawText('DATE', { x: datePillX + datePillW/2 - regular.widthOfTextAtSize('DATE', 7)/2, y: T(curY + 14), font: regular, size: 7, color: rgb(0.8, 0.97, 0.95) })
  page.drawText(data.eventDate || '—', { x: datePillX + datePillW/2 - bold.widthOfTextAtSize(data.eventDate || '—', 13)/2, y: T(curY + 30), font: bold, size: 13, color: WHITE })

  curY += sigH + 18

  // ── Footer logos ─────────────────────────────────────────────────────────────
  const FOOT_Y = 28
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

  // Fun squiggle line at very bottom
  page.drawRectangle({ x: 0, y: FOOT_Y - 2, width: W, height: 6, color: CORAL, opacity: 0.6 })

  return pdfDoc.save()
}
