import { PDFFont } from 'pdf-lib'

/** Convert top-down y (from page top) to pdf-lib bottom-up y */
export function top(pageHeight: number, y: number): number {
  return pageHeight - y
}

/** Word-wrap text to fit within maxWidth, returns array of lines */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : [text]
}

/** Center x for a string */
export function centerX(text: string, font: PDFFont, size: number, pageWidth: number): number {
  return (pageWidth - font.widthOfTextAtSize(text, size)) / 2
}

/** Draw a horizontal line */
export function hLine(
  page: { drawLine: (opts: object) => void },
  x1: number, x2: number, y: number,
  color: { r: number; g: number; b: number } | ReturnType<typeof import('pdf-lib').rgb>,
  thickness = 1
) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, color, thickness })
}

/** Embed JPEG from URL, returns null on failure */
export async function embedJpgFromUrl(
  pdfDoc: { embedJpg: (bytes: Uint8Array) => Promise<import('pdf-lib').PDFImage> },
  url: string
): Promise<import('pdf-lib').PDFImage | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await pdfDoc.embedJpg(new Uint8Array(await res.arrayBuffer()))
  } catch { return null }
}

/** Embed PNG from URL, returns null on failure */
export async function embedPngFromUrl(
  pdfDoc: { embedPng: (bytes: Uint8Array) => Promise<import('pdf-lib').PDFImage> },
  url: string
): Promise<import('pdf-lib').PDFImage | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await pdfDoc.embedPng(new Uint8Array(await res.arrayBuffer()))
  } catch { return null }
}
