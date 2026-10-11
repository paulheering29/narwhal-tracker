import { normalizeHeader } from '../csv/columns.js';
import { toIsoDate } from '../ar/records.js';
import { splitCommaName } from './names.js';

/**
 * Ohio's certified behavior analysts, from eLicense Ohio's own license search.
 *
 * Ohio also publishes every board's licensees as one 780 MB CSV, which is far
 * too much to download to find a few hundred people. The search page that the
 * public uses is a small Salesforce (Visualforce Remoting) call that answers
 * with JSON, and asking it for one board and one credential type is small.
 *
 * Three things about that call shape everything here:
 * - **It returns at most 150 people.** The page shows them ten to a page, so
 *   fifteen pages looks like "all of them" -- but asking for Cuyahoga County
 *   alone also returns 150, and only 25 of those were in the first 150. Nothing
 *   says the answer was cut short. So a search that returns 150 is split, by
 *   the first letters of the last name (which it matches as a prefix), until
 *   every piece is smaller.
 * - **The state of the licensee's address has to be given**, or it refuses the
 *   search as too broad. So it is asked for once per state -- Ohio being by far
 *   the largest, with the certified analysts who live elsewhere in the rest.
 * - **The page hands each visitor short-lived tokens** (`csrf`, `authorization`)
 *   that the call must carry back. They last a few days, and the page that
 *   issues them sits behind a bot check, so they cannot be fetched by the app.
 *   They are read from a request copied out of the person's own browser.
 */

export const OH_REQUEST_URL = 'https://elicense.ohio.gov/apexremote';
export const OH_BOARD = 'Psychology Board';
export const OH_LICENSE_TYPE = 'Certified Ohio Behavior Analyst';
/** The most the search will return. A result this size is not the whole answer. */
export const OH_RESULT_CAP = 150;

/** Every state, district and territory an address can be in -- the values the search accepts. */
export const US_STATE_CODES = (
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY ' +
  'PR VI GU AS MP AA AE AP'
).split(' ');

/**
 * Salesforce writes an object it uses twice once, as {"s": 3, "v": {...}}, and
 * every later use as {"r": 3}. Unfold both, so a record reads as the record.
 * References only ever point back to something already written, so one pass in
 * document order is enough.
 */
export function resolveRefs(value) {
  const shared = new Map();
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const keys = Object.keys(node);
      if (keys.length === 1 && keys[0] === 'r') return shared.get(node.r);
      if (keys.length === 2 && 's' in node && 'v' in node) {
        const inner = walk(node.v);
        shared.set(node.s, inner);
        return inner;
      }
      return Object.fromEntries(keys.map((key) => [key, walk(node[key])]));
    }
    return node;
  };
  return walk(value);
}

/**
 * The tokens out of a request copied from the browser -- either "Copy as cURL"
 * text or the bare JSON body. Any of the calls in it will do; the search's own
 * is preferred.
 *
 * @returns {{ csrf: string, vid: string, ns: string, ver: number, authorization: string } | null}
 */
export function readOhioTokens(text) {
  const raw = String(text ?? '');
  const candidates = [raw.match(/--data-raw\s+'([\s\S]*?)'\s*(?:\\\s*)?$/m)?.[1], raw.match(/--data(?:-binary)?\s+'([\s\S]*?)'\s*$/m)?.[1], raw.trim()];

  for (const candidate of candidates.filter(Boolean)) {
    let calls;
    try {
      calls = JSON.parse(candidate);
    } catch {
      continue;
    }
    const list = (Array.isArray(calls) ? calls : [calls]).filter((call) => call?.action === 'OH_VerifyLicenseCtlr' && call?.ctx);
    const call = list.find((c) => c.method === 'findLicensesForOwner') ?? list[0];
    const { csrf, vid, authorization, ns = '', ver } = call?.ctx ?? {};
    if (csrf && vid && authorization && ver) return { csrf, vid, ns, ver, authorization };
  }
  return null;
}

/**
 * When a token stops working, from the date its `csrf` carries (it is base64 of
 * base64 of "version,timestamp,signature"). Null if it cannot be read.
 */
export function ohioTokensExpire(tokens) {
  try {
    const once = globalThis.atob(tokens.csrf);
    const twice = globalThis.atob(once.split(',')[1]);
    const when = new Date(twice.split(',')[0]?.replace(/^.*?(\d{4}-)/, '$1'));
    return Number.isNaN(when.getTime()) ? null : when;
  } catch {
    return null;
  }
}

/** The body of one search: everyone of this credential whose address is in `state`, and (optionally) whose last name starts with `prefix`. */
export function ohioSearchBody(tokens, { state, prefix = '' }) {
  return [
    {
      action: 'OH_VerifyLicenseCtlr',
      method: 'findLicensesForOwner',
      data: [
        {
          firstName: '', lastName: prefix, middleName: '', contactAlias: '', board: OH_BOARD, licenseType: OH_LICENSE_TYPE,
          licenseNumber: '', city: '', state, county: 'none', businessBoard: '', businessLicenseType: '', businessLicenseNumber: '',
          businessCity: '', businessState: 'none', businessCounty: '', businessName: '', dbafileld: '', searchType: 'individual',
        },
      ],
      type: 'rpc',
      tid: 5,
      ctx: { csrf: tokens.csrf, vid: tokens.vid, ns: tokens.ns, ver: tokens.ver, authorization: tokens.authorization },
    },
  ];
}

/** The people in a search's answer, unfolded. Null if the answer is not what a search returns. */
export function ohioSearchResult(response) {
  const answer = resolveRefs(response)?.[0];
  if (!answer || answer.statusCode !== 200) return null;
  return Array.isArray(answer.result) ? answer.result : null;
}

/** Split a search that came back full: one search per possible next letter. */
export const ohioNextPrefixes = (prefix) => 'abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => prefix + letter);

/** The CSV columns a sweep is written as -- and read back from. No street addresses: nothing here has any use for them. */
export const OH_CSV_HEADERS = [
  'License Number', 'License Type', 'Board', 'Status', 'Sub Status', 'First Name', 'Middle Name', 'Last Name', 'Expiration Date', 'City', 'State',
];

/**
 * One person from a search's answer, as a row of OH_CSV_HEADERS. The structured
 * name inside the record is used when it is there; otherwise the "Last , First
 * Middle" line the search also carries is taken apart.
 */
export function ohioRow(person) {
  const license = person.license ?? {};
  const applicant = license.MUSW__Applicant__r ?? {};
  const parsed = splitCommaName(person.Applicant ?? person.Name);
  return {
    'License Number': String(license.Name ?? person.RecNumber ?? '').trim(),
    'License Type': person.Type ?? '',
    Board: person.Board ?? '',
    Status: person.Status ?? '',
    'Sub Status': person.SubStatus ?? '',
    'First Name': String(applicant.FirstName ?? parsed.firstName).trim(),
    'Middle Name': String(applicant.MiddleName ?? parsed.middleName).trim(),
    'Last Name': String(applicant.LastName ?? parsed.lastName).trim(),
    'Expiration Date': person.ExpirationDate ?? '',
    City: person.City ?? '',
    State: person.State ?? '',
  };
}

const REQUIRED = ['License Number', 'License Type', 'Board', 'Status', 'Sub Status', 'First Name', 'Last Name', 'Expiration Date'];
const BEHAVIOR_ANALYST = /behavior analyst/i;

/** Recognised by its headers, never its file name. */
export function identifyOhLicenseFile(headers) {
  const present = new Set((headers ?? []).map(normalizeHeader));
  return REQUIRED.every((column) => present.has(normalizeHeader(column)));
}

/**
 * The certified behavior analysts in a sweep's CSV, in the shape License Check
 * matches on.
 *
 * - Closed is an application that came to nothing, and Inactive/Withdrawn a
 *   credential given up: neither is a license, and both are dropped.
 * - Inactive/Expired is a license that ran out, and is recorded as Expired.
 * - Submitted is an application in progress, and is kept, so that someone
 *   partway there shows as needing review and not as missing.
 *
 * @param {Object[]} rows
 */
export function toOhLicenseRecords(rows) {
  const read = (row, name) => {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(name));
    return key === undefined ? '' : String(row[key] ?? '').trim();
  };

  return rows
    .filter((row) => BEHAVIOR_ANALYST.test(read(row, 'License Type')))
    .filter((row) => {
      const status = read(row, 'Status').toLowerCase();
      const sub = read(row, 'Sub Status').toLowerCase();
      return status !== 'closed' && !(status === 'inactive' && sub === 'withdrawn');
    })
    .map((row) => {
      const status = read(row, 'Status');
      const expiredInactive = status.toLowerCase() === 'inactive' && read(row, 'Sub Status').toLowerCase() === 'expired';
      return {
        jurisdiction: 'OH',
        number: read(row, 'License Number'),
        type: read(row, 'License Type'),
        status: expiredInactive ? 'Expired' : status,
        firstName: read(row, 'First Name'),
        middleName: read(row, 'Middle Name'),
        lastName: read(row, 'Last Name'),
        suffix: '',
        city: read(row, 'City'),
        state: read(row, 'State'),
        expires: toIsoDate(read(row, 'Expiration Date')),
      };
    })
    .filter((license) => license.number !== '');
}

/**
 * Everyone the search will give up, state by state and -- for a state where it
 * answers full -- letter by letter.
 *
 * `search(state, prefix)` asks once and resolves with that answer's people. A
 * full answer (OH_RESULT_CAP) is assumed to be cut short, so it is split by the
 * next letter of the last name, and again wherever a piece is still full. One
 * person can appear under two searches' answers, or twice for two applications,
 * so the result is one per license number.
 *
 * @param {(state: string, prefix: string) => Promise<Object[]>} search
 * @param {{ onProgress?: (done: number, state: string) => void, states?: string[] }} [options]
 * @returns {Promise<Object[]>} People as the search returns them, before `ohioRow`.
 */
export async function collectOhio(search, { onProgress, states = US_STATE_CODES } = {}) {
  // Last names do not run to more than a handful of letters before every piece is small.
  const MOST_LETTERS = 6;
  const found = new Map();
  const keep = (people) => {
    for (const person of people) found.set(person.LicenseId ?? person.RecNumber ?? JSON.stringify(person), person);
  };

  async function within(state, prefix) {
    const people = await search(state, prefix);
    if (people.length < OH_RESULT_CAP) return keep(people);
    if (prefix.length >= MOST_LETTERS) {
      // Cannot be narrowed further: keep what came, and never pretend it was all of it.
      keep(people);
      throw new Error(`Ohio's search returned only part of the last names starting "${prefix.toUpperCase()}", and they could not be split further.`);
    }
    for (const next of ohioNextPrefixes(prefix)) await within(state, next);
  }

  for (const [index, state] of states.entries()) {
    await within(state, '');
    onProgress?.(index + 1, state);
  }
  return [...found.values()];
}
