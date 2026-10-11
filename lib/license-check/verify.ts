import { nameKey, nameTokens } from './names'
import type { Person, StateLicense } from './types'

export type VerificationResult = 'verified' | 'expired' | 'not_found' | 'review'

export type Verification = {
  result: VerificationResult
  detail: string
  stateStatus: string | null
  stateExpiration: string | null
}

type Standing = 'current' | 'expired' | 'review'

// What a state calls a license in good standing / one that has run out.
const LIVE = new Set(['current', 'active', 'approved'])
const EXPIRED = new Set(['expired', 'lapsed', 'not renewed'])
// Licensed with a renewal under way (Connecticut); once its date has passed nobody can say which way it went.
const RENEWING = new Set(['active in renewal'])

/** A state's status word is not enough: the file can say Current for a date that has passed. */
function standing(l: StateLicense, today: string): Standing {
  const status = l.status.toLowerCase()
  const judgedByDate = status === ''   // a list with no status column can only be judged by its dates
  if (LIVE.has(status) || RENEWING.has(status) || judgedByDate) {
    if (!l.expires) return judgedByDate ? 'review' : 'current'
    if (l.expires < today) return RENEWING.has(status) ? 'review' : 'expired'
    return 'current'
  }
  if (EXPIRED.has(status)) return 'expired'
  // Suspended, surrendered, revoked, deceased, a condition: never paper over with a green tick.
  return 'review'
}

const RANK: Record<Standing, number> = { current: 0, review: 1, expired: 2 }
const best = (a: { s: Standing; l: StateLicense }, b: { s: Standing; l: StateLicense }) =>
  RANK[a.s] - RANK[b.s] || (b.l.expires ?? '').localeCompare(a.l.expires ?? '')

const numberKey = (n: string | null | undefined) => (n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const startsAlike = (a: string, b: string) => a !== b && Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))

/** Exact = same first and last name. Possible = close enough for a person to confirm, no more. */
function compareNames(person: Person, l: StateLicense): 'exact' | 'possible' | null {
  const last = nameKey(person.lastName)
  if (last === '') return null
  const firsts = new Set<string>()
  for (const n of [person.firstName, person.chosenName]) {
    firsts.add(nameKey(n)); firsts.add(nameKey(nameTokens(n)[0]))
  }
  firsts.delete('')
  if (firsts.size === 0) return null

  const first = nameKey(l.firstName)
  const firstWord = nameKey(nameTokens(l.firstName)[0])   // some states write the middle name into the first
  const middle = nameKey(l.middleName)
  const f = Array.from(firsts)

  if (last === nameKey(l.lastName)) {
    if (f.some(n => n === first || n === firstWord || (middle && n === first + middle))) return 'exact'
    if (middle && f.includes(middle)) return 'possible'
    if (f.some(n => startsAlike(n, first))) return 'possible'
    return null
  }
  const theirs = nameTokens(l.lastName).filter(t => t.length >= 3)
  const shared = nameTokens(person.lastName).some(t => t.length >= 3 && theirs.includes(t))
  return shared && f.includes(first) ? 'possible' : null
}

/** Middle names that could be one name: equal, one missing, or one an initial of the other. */
const middlesAgree = (a: string, b: string) => a === '' || b === '' || a.startsWith(b) || b.startsWith(a)

/** Two licenses under one name in one state are one person only if it is plainly someone who moved up. */
const sameHolder = (a: StateLicense, b: StateLicense) =>
  a.number === b.number || (a.type !== b.type && middlesAgree(nameKey(a.middleName), nameKey(b.middleName)))

function hasNamesake(matches: StateLicense[]): boolean {
  // An application is not a second person.
  const real = matches.filter(m => m.number !== '' && !/pending|submitted/i.test(m.status))
  const holders: StateLicense[][] = []
  for (const m of real) {
    const joined = holders.filter(h => h.some(o => sameHolder(m, o)))
    for (const h of joined) holders.splice(holders.indexOf(h), 1)
    holders.push([m, ...joined.flat()])
  }
  return holders.length > 1
}

const fmt = (iso: string | null) => {
  if (!iso) return 'no date'
  const [y, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}/${y}`
}

/**
 * Check one person's license against the state's published list.
 *
 * The number is the strong key and is used when we have it. Without one (or if
 * the state doesn't list it) we fall back to an exact name match. A shared name
 * is never resolved by guessing: it is sent for review.
 *
 * @param licenses  Only the records of the person's state.
 */
export function verifyLicense(
  person: Person,
  enteredNumber: string | null,
  enteredExpiration: string | null,
  licenses: StateLicense[],
  today: string,
  notFoundNote = '',
): Verification {
  let found: StateLicense[] = []
  let by: 'number' | 'name' = 'name'

  const key = numberKey(enteredNumber)
  if (key) {
    const hits = licenses.filter(l => numberKey(l.number) === key)
    if (hits.length) {
      // A number that belongs to someone with another name is a typo or the wrong person.
      if (!hits.some(h => compareNames(person, h) !== null)) {
        return {
          result: 'review', stateStatus: null, stateExpiration: null,
          detail: `License number ${enteredNumber} is listed under a different name than this person's.`,
        }
      }
      found = hits; by = 'number'
    }
  }

  if (found.length === 0) {
    const exact: StateLicense[] = []
    const possible: StateLicense[] = []
    for (const l of licenses) {
      const tier = compareNames(person, l)
      if (tier === 'exact') exact.push(l)
      else if (tier === 'possible') possible.push(l)
    }
    if (exact.length === 0) {
      return possible.length
        ? { result: 'review', stateStatus: null, stateExpiration: null,
            detail: 'A similar name is on the state list, but not this exact name. Enter the license number to confirm.' }
        : { result: 'not_found', stateStatus: null, stateExpiration: null,
            detail: 'Not found on the state list. Check the name and license number, or the state may not publish this license type.' + (notFoundNote ? ` ${notFoundNote}` : '') }
    }
    if (hasNamesake(exact)) {
      return { result: 'review', stateStatus: null, stateExpiration: null,
        detail: 'More than one license holder in this state has this name. Enter the license number to confirm.' }
    }
    found = exact
  }

  const ranked = found.map(l => ({ l, s: standing(l, today) })).sort(best)
  const { l, s } = ranked[0]
  const base = { stateStatus: l.status || null, stateExpiration: l.expires }
  const via = by === 'number' ? 'by license number' : 'by name'

  if (s === 'current') {
    // A wrong date here means reminders go out on the wrong day, so it is not a green tick.
    if (enteredExpiration && l.expires && enteredExpiration !== l.expires) {
      return { ...base, result: 'review',
        detail: `Active on the state list (${via}), but the state shows it expiring ${fmt(l.expires)} and the date entered here is ${fmt(enteredExpiration)}. Update the date.` }
    }
    return { ...base, result: 'verified', detail: `Active on the state list (${via}); expires ${fmt(l.expires)}.` }
  }
  if (s === 'expired') {
    return { ...base, result: 'expired',
      detail: `The state shows this license as ${l.status || 'expired'} (${via}); expiry ${fmt(l.expires)}.` }
  }
  return { ...base, result: 'review',
    detail: `The state lists this license as "${l.status}" (${via}). That needs a person's look.` }
}
