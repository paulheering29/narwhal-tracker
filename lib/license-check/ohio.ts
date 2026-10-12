import type { StateLicense } from './types'
import { toIsoDate } from './csv'
import { splitCommaName } from './names'

// Ohio's certified behavior analysts, from eLicense Ohio's own license search, which
// loads its results from a Salesforce Visualforce Remoting call that answers with JSON.
//  - It returns at most 150 people and doesn't say so. A search that comes back with 150
//    is split by the start of the last name (a prefix match), letter by letter.
//  - A state must be given (the licensee's address state), so it is asked once per state.
//  - Every call carries short-lived tokens (csrf, authorization, vid) that the page hands
//    each visitor and that last about three days. The page sits behind a bot check, so the
//    person copies one search request out of their own browser and the tokens are read from
//    that. Nothing else in it (cookies included) is kept, and the tokens are never stored.
const URL = 'https://elicense.ohio.gov/apexremote'
const BOARD = 'Psychology Board'
const LICENSE_TYPE = 'Certified Ohio Behavior Analyst'
const RESULT_CAP = 150
const MOST_LETTERS = 6
const PAUSE_MS = 300

const STATE_CODES = (
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY ' +
  'PR VI GU AS MP AA AE AP AB BC MB NB NL NS NT NU ON PE QC SK YT MH NF PQ UK'
).split(' ')

type Tokens = { csrf: string; vid: string; ns: string; ver: number; authorization: string }
type OhioPerson = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- Salesforce's record, read defensively below

/**
 * Salesforce writes an object it uses twice once, as {"s": 3, "v": {...}}, and every
 * later use as {"r": 3}. Unfold both so a record reads as the record.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveRefs(value: any): any {
  const shared = new Map<number, unknown>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any): any => {
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      const keys = Object.keys(node)
      if (keys.length === 1 && keys[0] === 'r') return shared.get(node.r)
      if (keys.length === 2 && 's' in node && 'v' in node) { const inner = walk(node.v); shared.set(node.s, inner); return inner }
      return Object.fromEntries(keys.map(k => [k, walk(node[k])]))
    }
    return node
  }
  return walk(value)
}

/** The tokens out of "Copy as cURL" text (or the bare JSON body) copied from a search on eLicense Ohio. */
export function readOhioTokens(text: string): Tokens | null {
  const candidates = [
    text.match(/--data-raw\s+'([\s\S]*?)'\s*(?:\\\s*)?$/m)?.[1],
    text.match(/--data(?:-binary)?\s+'([\s\S]*?)'\s*$/m)?.[1],
    text.trim(),
  ]
  for (const candidate of candidates.filter(Boolean) as string[]) {
    let calls: unknown
    try { calls = JSON.parse(candidate) } catch { continue }
    const list = (Array.isArray(calls) ? calls : [calls]).filter(c => c?.action === 'OH_VerifyLicenseCtlr' && c?.ctx)
    const call = list.find(c => c.method === 'findLicensesForOwner') ?? list[0]
    const { csrf, vid, authorization, ns = '', ver } = call?.ctx ?? {}
    if (csrf && vid && authorization && ver) return { csrf, vid, ns, ver, authorization }
  }
  return null
}

/** When a token stops working, from the date its csrf carries (base64 of base64). Null if unreadable. */
function tokensExpire(t: Tokens): Date | null {
  try {
    const once = atob(t.csrf)
    const twice = atob(once.split(',')[1])
    const when = new Date(twice.split(',')[0]?.replace(/^.*?(\d{4}-)/, '$1'))
    return Number.isNaN(when.getTime()) ? null : when
  } catch { return null }
}

const searchBody = (t: Tokens, state: string, prefix: string) => [{
  action: 'OH_VerifyLicenseCtlr', method: 'findLicensesForOwner',
  data: [{
    firstName: '', lastName: prefix, middleName: '', contactAlias: '', board: BOARD, licenseType: LICENSE_TYPE,
    licenseNumber: '', city: '', state, county: 'none', businessBoard: '', businessLicenseType: '', businessLicenseNumber: '',
    businessCity: '', businessState: 'none', businessCounty: '', businessName: '', dbafileld: '', searchType: 'individual',
  }],
  type: 'rpc', tid: 5,
  ctx: { csrf: t.csrf, vid: t.vid, ns: t.ns, ver: t.ver, authorization: t.authorization },
}]

const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

/** One search. Only the search itself and the copied tokens are sent: no cookies. */
async function ask(t: Tokens, state: string, prefix: string): Promise<OhioPerson[]> {
  const res = await fetch(URL, {
    method: 'POST', redirect: 'manual',
    headers: {
      'Content-Type': 'application/json', Origin: 'https://elicense.ohio.gov', Referer: 'https://elicense.ohio.gov/oh_verifylicense',
      'X-User-Agent': 'Visualforce-Remoting', 'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(searchBody(t, state, prefix)),
    signal: AbortSignal.timeout(40_000),
  })
  if (!res.ok) throw new Error(`eLicense Ohio answered ${res.status}.`)
  let answer: unknown
  try { answer = JSON.parse(await res.text()) } catch { throw new Error("eLicense Ohio's answer wasn't in the form we expected.") }
  const first = resolveRefs(answer)?.[0]
  // What a stale token looks like: the call is answered, but not with a list.
  if (!first || first.statusCode !== 200 || !Array.isArray(first.result)) {
    throw new Error('eLicense Ohio refused the search. The copied request has probably expired: copy a fresh one from the site.')
  }
  await pause(PAUSE_MS)
  return first.result
}

const personKey = (p: OhioPerson) => String(p.LicenseId ?? p.RecNumber ?? JSON.stringify(p))

/** Everyone the search will give up, state by state and, where it answers full, letter by letter. */
async function collect(t: Tokens): Promise<OhioPerson[]> {
  const found = new Map<string, OhioPerson>()
  const keep = (people: OhioPerson[]) => { for (const p of people) found.set(personKey(p), p) }

  async function within(state: string, prefix: string): Promise<void> {
    const people = await ask(t, state, prefix)
    if (people.length < RESULT_CAP) return keep(people)
    if (prefix.length >= MOST_LETTERS) {
      throw new Error(`Ohio's search returned only part of the last names starting "${prefix.toUpperCase()}", and they could not be split further.`)
    }
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') await within(state, prefix + letter)
  }
  for (const state of STATE_CODES) await within(state, '')
  return Array.from(found.values())
}

function toLicense(p: OhioPerson): StateLicense | null {
  const license = p.license ?? {}
  const applicant = license.MUSW__Applicant__r ?? {}
  const parsed = splitCommaName(String(p.Applicant ?? p.Name ?? ''))
  const status = String(p.Status ?? '').trim()
  const sub = String(p.SubStatus ?? '').trim().toLowerCase()
  const type = String(p.Type ?? '')

  if (!/behavior analyst/i.test(type)) return null
  // Closed is an abandoned application; Inactive/Withdrawn a credential given up. Neither is a license.
  if (status.toLowerCase() === 'closed' || (status.toLowerCase() === 'inactive' && sub === 'withdrawn')) return null
  const number = String(license.Name ?? p.RecNumber ?? '').trim()
  if (!number) return null
  return {
    jurisdiction: 'OH', number, type,
    // Inactive/Expired is a license that ran out. Submitted (an application in progress) is kept, so it reads as "needs review".
    status: status.toLowerCase() === 'inactive' && sub === 'expired' ? 'Expired' : status,
    firstName: String(applicant.FirstName ?? parsed.firstName).trim(),
    middleName: String(applicant.MiddleName ?? parsed.middleName).trim(),
    lastName: String(applicant.LastName ?? parsed.lastName).trim(),
    city: String(p.City ?? ''), state: String(p.State ?? ''),
    expires: toIsoDate(String(p.ExpirationDate ?? '')),
  }
}

/**
 * @param copiedRequest  "Copy as cURL" text from a search on eLicense Ohio.
 * @throws with a plain message if the paste isn't such a request, has expired, or Ohio refuses it.
 */
export async function fetchOhio(copiedRequest: string): Promise<StateLicense[]> {
  const tokens = readOhioTokens(copiedRequest)
  if (!tokens) throw new Error("That doesn't look like a request copied from eLicense Ohio's license search. It should contain a call named findLicensesForOwner.")
  const expires = tokensExpire(tokens)
  if (expires && expires < new Date()) throw new Error('That copied request has expired. Search again on eLicense Ohio and copy a fresh one.')
  return (await collect(tokens)).map(toLicense).filter((l): l is StateLicense => l !== null)
}
