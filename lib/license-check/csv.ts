/** Minimal CSV reader (any single-character delimiter; New Jersey's file uses |) (quotes, doubled quotes, CRLF) -- the state files need nothing more. */
export function parseCsv(text: string, delimiter = ','): { headers: string[]; rows: Record<string, string>[] } {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false
  const src = text.replace(/^﻿/, '')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) { record.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      record.push(field); field = ''
      if (record.some(v => v !== '')) records.push(record)
      record = []
    } else field += c
  }
  if (field !== '' || record.length) { record.push(field); if (record.some(v => v !== '')) records.push(record) }

  const headers = (records.shift() ?? []).map(h => h.trim())
  const rows = records.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])))
  return { headers, rows }
}

/** "2/12/26 0:00" or "2026-02-12" -> "2026-02-12"; anything else -> null. */
export function toIsoDate(text: string): string | null {
  const raw = String(text ?? '').trim()
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/)
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  let y: number, m: number, d: number
  if (us) { y = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]); m = Number(us[1]); d = Number(us[2]) }
  else if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]) }
  else return null
  const date = new Date(Date.UTC(y, m - 1, d))
  // 2/30/26 is not a date, and Date would quietly make it March.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date.toISOString().slice(0, 10)
}
