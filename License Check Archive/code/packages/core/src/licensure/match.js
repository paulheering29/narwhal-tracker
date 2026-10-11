import { nameKey, nameTokens } from './names.js';
import { createColumnResolver } from '../csv/columns.js';

/** Within this many days of expiring, a current license is worth a warning. */
export const EXPIRING_DAYS = 90;

/**
 * What can be said about one person, worst news first -- the order the report
 * lists them in when nobody has asked for another.
 */
export const OUTCOMES = [
  { id: 'expired', label: 'Expired' },
  { id: 'review', label: 'Needs review' },
  { id: 'none', label: 'Not found' },
  { id: 'multiple', label: 'Multiple matches' },
  { id: 'possible', label: 'Possible match' },
  { id: 'expiring', label: 'Expiring soon' },
  { id: 'current', label: 'Licensed' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** Whole days from `today` to `expires`; negative once it has passed. */
export const daysUntil = (expires, today) => (expires ? dayNumber(expires) - dayNumber(today) : null);

/**
 * CentralReach's people, reduced to the parts a match needs.
 *
 * @param {{headers: string[], rows: Object[]}} contacts  A staff download.
 */
export function toStaffRecords(contacts) {
  const { resolve } = createColumnResolver(contacts.headers);
  const text = (row, name) => {
    const header = resolve(name);
    return header ? String(row[header] ?? '').trim() : '';
  };

  return contacts.rows.map((row) => {
    const active = text(row, 'IsActive').toLowerCase();
    return {
      id: text(row, 'Id'),
      firstName: text(row, 'FirstName'),
      lastName: text(row, 'LastName'),
      chosenName: text(row, 'ChosenName'),
      credentials: text(row, 'Credentials'),
      // Blank when the download has no such column: better unknown than wrong.
      active: active === '' ? null : !['false', '0', 'no'].includes(active),
    };
  });
}

/** What a state calls a license in good standing: Massachusetts says Current, Rhode Island says Active. */
const LIVE = new Set(['current', 'active', 'approved']);

/** Licensed with a renewal under way (Connecticut). Once its date has passed nobody can say which way it went. */
const RENEWING = new Set(['active in renewal']);

/** What a state calls a license that has run out: New Jersey says Expired, Arizona says Expired or Lapsed. */
const EXPIRED = new Set(['expired', 'lapsed', 'not renewed']);

/** How a license stands today, on its own terms. */
function standing(license, today) {
  const status = license.status.toLowerCase();
  // A list with no status column (Texas) can only be judged by its dates.
  const judgedByDate = status === '';

  if (LIVE.has(status) || RENEWING.has(status) || judgedByDate) {
    const days = daysUntil(license.expires, today);
    if (days === null) return judgedByDate ? 'review' : 'current';
    if (days < 0) return RENEWING.has(status) ? 'review' : 'expired';
    return days <= EXPIRING_DAYS ? 'expiring' : 'current';
  }
  if (EXPIRED.has(status)) return 'expired';
  // Suspended, surrendered, revoked, deceased, on a non-disciplinary condition:
  // the state says something we should not paper over with a green tick.
  return 'review';
}

/** Best first: a live license beats a lapsed one, then whichever runs longest. */
const RANK = { current: 0, expiring: 1, review: 2, expired: 3 };
const byBest = (a, b) => RANK[a.standing] - RANK[b.standing] || (b.expires ?? '').localeCompare(a.expires ?? '');

/** One name is the start of the other, and long enough not to be coincidence: Alex / Alexander. */
const startsAlike = (a, b) => a !== b && Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a));

function prepareLicense(license) {
  return {
    license,
    first: nameKey(license.firstName),
    // Some states write the middle name into the first: "Hannah Francesca". The
    // word she goes by is the first of them.
    firstWord: nameKey(nameTokens(license.firstName)[0]),
    middle: nameKey(license.middleName),
    last: nameKey(license.lastName),
    lastTokens: nameTokens(license.lastName).filter((token) => token.length >= 3),
  };
}

/**
 * Every way a person's first name might be written: as exported, the word it
 * starts with, and the name they go by.
 */
function firstNames(person) {
  const keys = new Set();
  for (const name of [person.firstName, person.chosenName]) {
    keys.add(nameKey(name));
    keys.add(nameKey(nameTokens(name)[0]));
  }
  keys.delete('');
  return [...keys];
}

/**
 * Whether a license could belong to this person, and how sure we are.
 *
 * Exact is the same first and last name. Possible is close enough to be worth
 * a person's glance and no more: a nickname, a first name that is the license's
 * middle name, or half of a compound surname.
 */
function compare(person, prepared) {
  const { first, firstWord, middle, last, lastTokens } = prepared;
  const personLast = nameKey(person.lastName);
  if (personLast === '' || person.firsts.length === 0) return null;

  if (personLast === last) {
    if (person.firsts.some((name) => name === first || name === firstWord || (middle && name === first + middle))) return { tier: 'exact' };
    if (middle && person.firsts.includes(middle)) return { tier: 'possible', why: 'First name is the middle name on the license' };
    if (person.firsts.some((name) => startsAlike(name, first))) return { tier: 'possible', why: 'First names start alike' };
    return null;
  }

  const shared = nameTokens(person.lastName).some((token) => token.length >= 3 && lastTokens.includes(token));
  if (shared && person.firsts.includes(first)) return { tier: 'possible', why: 'Part of a compound last name matches' };
  return null;
}

/** Middle names that could be one name: equal, one missing, or one an initial of the other. */
const middlesAgree = (a, b) => a === '' || b === '' || a.startsWith(b) || b.startsWith(a);

/**
 * Whether two licenses under one name in one state belong to one person.
 *
 * The same number obviously does. So does an assistant license beside a full one
 * -- different types, middle names that do not conflict: that is someone who
 * moved up, and Washington's list has nearly three hundred of them. Two
 * licenses of the *same* type cannot be one person, nor can two with different
 * middle names.
 */
function sameHolder(a, b) {
  if (a.number === b.number) return true;
  return a.type !== b.type && middlesAgree(nameKey(a.middleName), nameKey(b.middleName));
}

/**
 * Whether two different people in one state's list have this name.
 *
 * Within a state it is a namesake. Across states it is not treated as one: each
 * state's regulator is asked separately, and a person licensed in both
 * Massachusetts and Rhode Island is unremarkable, so one match in each is
 * reported as both licenses and not as a name that cannot be told apart.
 */
function sharesNameWithinAState(exact) {
  const byState = new Map();
  for (const match of exact) {
    // An application is not a second person: someone with an active license and a
    // pending one for the next level up is one person. (New Jersey's applicants
    // have no number at all.)
    if (match.number === '' || /pending|submitted/i.test(match.status)) continue;
    byState.set(match.jurisdiction, [...(byState.get(match.jurisdiction) ?? []), match]);
  }

  for (const matches of byState.values()) {
    // Group into holders: matches joined by sameHolder, directly or through another.
    const holders = [];
    for (const match of matches) {
      const joined = holders.filter((holder) => holder.some((other) => sameHolder(match, other)));
      const merged = [match, ...joined.flat()];
      for (const holder of joined) holders.splice(holders.indexOf(holder), 1);
      holders.push(merged);
    }
    if (holders.length > 1) return true;
  }
  return false;
}

/**
 * Line CentralReach's people up against state license lists.
 *
 * One result per person, always -- someone we cannot find is a result, not an
 * absence, because "not found" is exactly what the report is for.
 *
 * When several licenses in one state share a name the answer is `multiple`, not a guess:
 * twenty-one names in the Massachusetts behavior analyst list belong to more
 * than one person, and quietly picking the one with a current license would
 * report somebody as licensed on the strength of a stranger's.
 *
 * @param {ReturnType<typeof toStaffRecords>} staff
 * @param {ReturnType<import('./massachusetts.js').toMassLicenseRecords>} licenses
 * @param {string} today  ISO date, "2026-09-20".
 */
export function matchLicenses(staff, licenses, today) {
  const prepared = licenses.map(prepareLicense);

  return staff.map((person) => {
    const subject = { ...person, firsts: firstNames(person) };
    const exact = [];
    const possible = [];

    for (const candidate of prepared) {
      const found = compare(subject, candidate);
      if (!found) continue;
      const match = {
        ...candidate.license,
        standing: standing(candidate.license, today),
        daysLeft: daysUntil(candidate.license.expires, today),
        why: found.why ?? null,
      };
      (found.tier === 'exact' ? exact : possible).push(match);
    }

    exact.sort(byBest);
    possible.sort(byBest);

    let outcome;
    if (exact.length === 0) outcome = possible.length === 0 ? 'none' : 'possible';
    else if (sharesNameWithinAState(exact)) outcome = 'multiple';
    else outcome = exact[0].standing;

    return {
      staffId: person.id,
      staffName: [person.firstName, person.lastName].filter(Boolean).join(' '),
      credentials: person.credentials,
      active: person.active,
      outcome,
      matches: exact.length > 0 ? exact : possible,
    };
  });
}
