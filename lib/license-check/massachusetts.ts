import JSZip from 'jszip'
import { parseCsv, toIsoDate } from './csv'
import type { StateLicense, StateSource } from './types'

// The state's Bureau of Health Professions Licensure publishes a ZIP per license
// type (a data CSV plus a small CSV describing its columns) and treats it as
// primary source verification. The same public addresses its own "Download
// License Data" page uses -- no key, no login.
const API = 'https://healthprofessionlicensing-api.mass.gov/api-public'
const LIST_URL = `${API}/export/all`
const exportUrl = (id: number) => `${API}/export/data/license/${encodeURIComponent(String(id))}`

const MAX_LIST_BYTES = 5_000_000
const MAX_FILE_BYTES = 50_000_000
const REQUIRED = ['License Number', 'License Type', 'License Status', 'First Name', 'Last Name', 'Expiration Date']
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

async function ask(url: string, maxBytes: number): Promise<Buffer> {
  const res = await fetch(url, {
    redirect: 'manual',
    headers: { 'User-Agent': 'TrainingLoop (license list download)' },
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`Massachusetts' site answered ${res.status}.`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > maxBytes) throw new Error("Massachusetts' file is far larger than expected, so it was not read.")
  return buf
}

/**
 * Found by name, not number: the state's own list says which download is which,
 * so this follows it if it renumbers them. Other professions are left alone.
 */
export function pickBehaviorAnalystExports(listing: unknown): { id: number; name: string }[] {
  if (!Array.isArray(listing)) return []
  return listing
    .filter(i => i && i.visible !== false && Number.isInteger(i.licenseMetaId)
      && typeof i.name === 'string' && /behavior_analyst_license_export/i.test(i.name))
    .map(i => ({ id: i.licenseMetaId as number, name: i.name as string }))
}

/** A download's name without the moment it was made, so a newer copy replaces an older one. */
const exportKey = (name: string) => name.replace(/_Export_.*$/, '').replace(/\.(zip|csv)$/i, '')

export function toLicenses(rows: Record<string, string>[]): StateLicense[] {
  const read = (row: Record<string, string>, name: string) => {
    const key = Object.keys(row).find(h => norm(h) === norm(name))
    return key === undefined ? '' : (row[key] ?? '').trim()
  }
  return rows
    .map(row => ({
      jurisdiction: 'MA',
      number: read(row, 'License Number'),
      type: read(row, 'License Type'),
      status: read(row, 'License Status'),
      firstName: read(row, 'First Name'),
      middleName: read(row, 'Middle Name'),
      lastName: read(row, 'Last Name'),
      city: read(row, 'City'),
      state: read(row, 'State'),
      expires: toIsoDate(read(row, 'Expiration Date')),
    }))
    .filter(l => l.number !== '')
}

async function licensesInZip(buffer: Buffer): Promise<StateLicense[]> {
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error("Massachusetts' site sent something that isn't a ZIP.")
  const zip = await JSZip.loadAsync(buffer)
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/\.csv$/i.test(entry.name)) continue
    const { headers, rows } = parseCsv(await entry.async('string'))
    // The data file is recognised by its columns; the metadata CSV beside it is not.
    if (REQUIRED.every(c => headers.some(h => norm(h) === norm(c)))) return toLicenses(rows)
  }
  throw new Error('No license data was found in the Massachusetts download.')
}

export const massachusetts: StateSource = {
  code: 'MA',
  async fetch() {
    let listing: unknown
    try { listing = JSON.parse((await ask(LIST_URL, MAX_LIST_BYTES)).toString('utf8')) }
    catch (e) {
      throw e instanceof SyntaxError ? new Error("Massachusetts' list of downloads wasn't in the form we expected.") : e
    }
    const wanted = pickBehaviorAnalystExports(listing)
    if (wanted.length === 0) throw new Error("Massachusetts' list no longer shows the behavior analyst downloads.")

    // A newer download of the same license type replaces the older one.
    const latest = new Map<string, { id: number; name: string }>()
    for (const w of wanted) {
      const key = exportKey(w.name)
      const have = latest.get(key)
      if (!have || w.name > have.name) latest.set(key, w)
    }

    const licenses: StateLicense[] = []
    let sourceDate: string | null = null
    for (const w of Array.from(latest.values())) {
      licenses.push(...await licensesInZip(await ask(exportUrl(w.id), MAX_FILE_BYTES)))
      const d = w.name.match(/(\d{4}-\d{2}-\d{2})T\d{2}_\d{2}/)?.[1] ?? null
      if (d && (!sourceDate || d > sourceDate)) sourceDate = d
    }
    return { licenses, sourceDate }
  },
}
