import { parseCsv, toIsoDate } from './csv'
import { splitCommaName, splitPlainName } from './names'
import type { StateLicense, StateSource } from './types'

// One reader per state. Each downloads the state's own public list from the
// address its site uses (no key, no login) and returns only behavior analysts,
// in one shape. Only the columns we need are requested where the state allows it,
// so birth years, street addresses and phone numbers never come down.

const MAX_BYTES = 25_000_000

async function getCsv(url: string, init?: RequestInit): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const res = await fetch(url, {
    redirect: 'manual',
    ...init,
    headers: { 'User-Agent': 'TrainingLoop (license list download)', ...init?.headers },
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`The state's site answered ${res.status}.`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) throw new Error("The state's file is far larger than expected, so it was not read.")
  return parseCsv(buf.toString('utf8'))
}

/** A page (error, maintenance notice) in place of the list should say so, not fail later as "no rows". */
function requireColumns(headers: string[], needed: string[], who: string) {
  const have = new Set(headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '')))
  if (!needed.every(n => have.has(n.toLowerCase().replace(/[^a-z0-9]/g, '')))) {
    throw new Error(`${who} sent something that wasn't the list we asked for.`)
  }
}

const cell = (row: Record<string, string>, name: string) => (row[name] ?? '').trim()

export const rhodeIsland: StateSource = {
  code: 'RI',
  // Rhode Island publishes only active licenses, so a lapse reads as "not found".
  notFoundNote: 'Rhode Island publishes only active licenses, so a lapsed license also shows as not found.',
  async fetch() {
    // Both license types sit under the profession "Applied Behavior Analyst".
    const { headers, rows } = await getCsv('https://datahealth.ri.gov/lists/licensees/download.php', {
      method: 'POST',
      body: new URLSearchParams({ prof: 'Applied Behavior Analyst', licType: '', output: '' }),
    })
    requireColumns(headers, ['License No', 'Profession', 'Status', 'Expiration Date', 'First', 'Last'], "Rhode Island's site")
    const licenses: StateLicense[] = rows
      .filter(r => /behavior analyst/i.test(cell(r, 'Profession')))
      .map(r => ({
        jurisdiction: 'RI', number: cell(r, 'License No'), type: cell(r, 'License Type'), status: cell(r, 'Status'),
        firstName: cell(r, 'First'), middleName: cell(r, 'Middle'), lastName: cell(r, 'Last'),
        city: cell(r, 'City'), state: cell(r, 'State') === 'NA' ? '' : cell(r, 'State'),
        expires: toIsoDate(cell(r, 'Expiration Date')),
      }))
      .filter(l => l.number !== '')
    return { licenses, sourceDate: null }
  },
}

export const washington: StateSource = {
  code: 'WA',
  async fetch() {
    const url = 'https://data.wa.gov/resource/qxh8-f4bd.csv?' + new URLSearchParams({
      $select: 'credentialnumber,lastname,firstname,middlename,credentialtype,status,expirationdate',
      $where: "upper(credentialtype) like '%BEHAVIOR ANALYST%'",
      $order: 'credentialnumber', $limit: '50000',
    })
    const { headers, rows } = await getCsv(url)
    requireColumns(headers, ['credentialnumber', 'credentialtype', 'status', 'expirationdate', 'firstname', 'lastname'], "Washington's site")
    // Superseded = an assistant credential replaced by a full license; Closed/Denied = applications that came to nothing.
    // Pending (an application in progress) is kept, so it reads as needing review, not as missing.
    const dropped = new Set(['superseded', 'closed', 'denied'])
    const licenses: StateLicense[] = rows
      .filter(r => /behavior analyst/i.test(cell(r, 'credentialtype')) && !dropped.has(cell(r, 'status').toLowerCase()))
      .map(r => ({
        jurisdiction: 'WA', number: cell(r, 'credentialnumber'), type: cell(r, 'credentialtype'), status: cell(r, 'status'),
        firstName: cell(r, 'firstname'), middleName: cell(r, 'middlename'), lastName: cell(r, 'lastname'),
        city: '', state: '', expires: toIsoDate(cell(r, 'expirationdate')),
      }))
      .filter(l => l.number !== '')
    return { licenses, sourceDate: null }
  },
}

export const texas: StateSource = {
  code: 'TX',
  async fetch() {
    const url = 'https://data.texas.gov/resource/7358-krk7.csv?' + new URLSearchParams({
      $select: 'license_type,license_number,owner_name,license_expiration_date_mmddccyy',
      $where: "upper(license_type) like '%BEHAVIOR ANALYST%'",
      $order: 'license_number', $limit: '50000',
    })
    const { headers, rows } = await getCsv(url)
    requireColumns(headers, ['license_type', 'license_number', 'owner_name', 'license_expiration_date_mmddccyy'], "Texas' site")
    const licenses: StateLicense[] = rows
      .filter(r => /behavior analyst/i.test(cell(r, 'license_type')))
      .map(r => ({
        jurisdiction: 'TX', number: cell(r, 'license_number'), type: cell(r, 'license_type'), status: '',
        ...splitCommaName(cell(r, 'owner_name')), city: '', state: '',
        expires: toIsoDate(cell(r, 'license_expiration_date_mmddccyy')),
      }))
      .filter(l => l.number !== '')
    return { licenses, sourceDate: null }
  },
}

export const illinois: StateSource = {
  code: 'IL',
  async fetch() {
    // Filed under `description` as "LICENSED BEHAVIORAL ANALYST" -- a search for "behavior analyst" finds none.
    const url = 'https://data.illinois.gov/resource/pzzh-kp68.csv?' + new URLSearchParams({
      $select: 'license_number,description,license_status,first_name,middle,last_name,expiration_date,city,state',
      $where: "upper(description) like '%BEHAVIORAL ANALYST%'",
      $order: 'license_number', $limit: '50000',
    })
    const { headers, rows } = await getCsv(url)
    requireColumns(headers, ['license_number', 'license_status', 'description', 'first_name', 'last_name', 'expiration_date'], "Illinois' site")
    const licenses: StateLicense[] = rows
      .filter(r => /behavior(al)? analyst/i.test(cell(r, 'description')))
      .map(r => ({
        jurisdiction: 'IL', number: cell(r, 'license_number'), type: cell(r, 'description'), status: cell(r, 'license_status'),
        firstName: cell(r, 'first_name'), middleName: cell(r, 'middle'), lastName: cell(r, 'last_name'),
        city: cell(r, 'city'), state: cell(r, 'state'), expires: toIsoDate(cell(r, 'expiration_date')),
      }))
      .filter(l => l.number !== '')
    return { licenses, sourceDate: null }
  },
}

export const connecticut: StateSource = {
  code: 'CT',
  async fetch() {
    const url = 'https://data.ct.gov/resource/ngch-56tr.csv?' + new URLSearchParams({
      $select: 'credentialnumber,name,credential,type,status,statusreason,expirationdate,city,state',
      $where: "credential = 'Behavior Analyst'",
      $order: 'credentialnumber', $limit: '50000',
    })
    const { headers, rows } = await getCsv(url)
    requireColumns(headers, ['credentialnumber', 'name', 'credential', 'status', 'expirationdate'], "Connecticut's site")
    const licenses: StateLicense[] = rows
      .filter(r => /behavior analyst/i.test(cell(r, 'credential')))
      // One credential belongs to a corporation, not a person; expired applications came to nothing.
      .filter(r => (cell(r, 'type') || 'INDIVIDUAL').toUpperCase() === 'INDIVIDUAL')
      .filter(r => cell(r, 'status').toUpperCase() !== 'EXPIRED APPLICATION')
      .map(r => {
        const status = cell(r, 'status')
        const lapsed = status.toUpperCase() === 'INACTIVE' && /lapsed/i.test(cell(r, 'statusreason'))
        return {
          jurisdiction: 'CT', number: cell(r, 'credentialnumber'), type: cell(r, 'credential'),
          status: lapsed ? 'Lapsed' : status, ...splitPlainName(cell(r, 'name')),
          city: cell(r, 'city'), state: cell(r, 'state'), expires: toIsoDate(cell(r, 'expirationdate')),
        }
      })
      .filter(l => l.number !== '')
    return { licenses, sourceDate: null }
  },
}
