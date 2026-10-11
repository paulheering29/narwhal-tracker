import type { StateLicense, StateSource } from './types'

// Pennsylvania licenses behavior analysts as "Behavior Specialists" (State Board of
// Medicine). The Department of State sells the whole list; PALS, the public license
// search, gives the same people away through a plain JSON call that needs no login,
// cookies or CAPTCHA (if the site switches its CAPTCHA on, the answer stops being a
// list and the fetch says so).
//
// A search answers 50 people a page and never reports more than 500, so a search
// that says 500 is split by the next letter of the last name (a prefix match),
// recursively. About 200 requests. There is no expiry date, only a status.
const SEARCH_URL = 'https://www.pals.pa.gov/api/Search/SearchForPersonOrFacilty'
const PROFESSION_ID = 37     // State Board of Medicine
const LICENSE_TYPE_ID = 180  // Behavior Specialist
const PAGE_SIZE = 50
const RESULT_CAP = 500
const MOST_LETTERS = 6
const CONCURRENCY = 3        // a state's public site is not ours to hammer
const PAUSE_MS = 100

type Person = {
  LicenseNumber?: string; LicenseId?: string; LicenceType?: string; Status?: string; TotalRecords?: number
  FirstName?: string; MiddleName?: string; LastName?: string; City?: string; State?: string
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

async function search(prefix: string, page: number): Promise<Person[]> {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', Origin: 'https://www.pals.pa.gov', Referer: 'https://www.pals.pa.gov/' },
    body: JSON.stringify({
      OptPersonFacility: 'Person', ProfessionID: PROFESSION_ID, LicenseTypeId: LICENSE_TYPE_ID,
      ...(prefix ? { LastName: prefix } : {}),
      State: '', Country: 'ALL', County: null, IsFacility: 0, PersonId: null, PageNo: page,
    }),
    signal: AbortSignal.timeout(40_000),
  })
  if (!res.ok) throw new Error(`PALS answered ${res.status}.`)
  let answer: unknown
  try { answer = JSON.parse(await res.text()) } catch { throw new Error("PALS's answer wasn't in the form we expected.") }
  if (!Array.isArray(answer)) throw new Error('PALS did not answer the search with a list, which it does when it wants the search made from a web page.')
  await pause(PAUSE_MS)
  return answer as Person[]
}

/** Run `fn` over the items, a few at a time. */
async function inParallel<T>(items: T[], fn: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item)
  }))
}

async function collect(): Promise<Person[]> {
  const found = new Map<string, Person>()   // one person is one license number
  const keep = (people: Person[]) => { for (const p of people) found.set(p.LicenseNumber ?? p.LicenseId ?? '', p) }

  async function within(prefix: string): Promise<void> {
    const first = await search(prefix, 1)
    if (first.length === 0) return
    const total = first[0].TotalRecords ?? first.length
    if (total >= RESULT_CAP) {
      if (prefix.length >= MOST_LETTERS) throw new Error(`PALS reported only part of the last names starting "${prefix.toUpperCase()}", and they could not be split further.`)
      await inParallel('abcdefghijklmnopqrstuvwxyz'.split(''), letter => within(prefix + letter))
      return
    }
    keep(first)
    for (let page = 2; (page - 1) * PAGE_SIZE < total; page += 1) keep(await search(prefix, page))
  }

  await within('')
  return Array.from(found.values())
}

export const pennsylvania: StateSource = {
  code: 'PA',
  async fetch() {
    const text = (v: unknown) => String(v ?? '').trim()
    const licenses: StateLicense[] = (await collect())
      .filter(p => /behavior specialist/i.test(text(p.LicenceType)))
      .map(p => ({
        jurisdiction: 'PA', number: text(p.LicenseNumber), type: text(p.LicenceType), status: text(p.Status),
        firstName: text(p.FirstName), middleName: text(p.MiddleName), lastName: text(p.LastName),
        city: text(p.City), state: text(p.State),
        expires: null,   // PALS gives a status but no expiry date
      }))
      .filter(l => l.number !== '')
    return { licenses, sourceDate: null }
  },
}
