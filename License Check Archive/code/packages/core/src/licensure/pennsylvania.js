import { normalizeHeader } from '../csv/columns.js';

/**
 * Pennsylvania's Behavior Specialists, from PALS -- the Department of State's
 * public license search.
 *
 * Pennsylvania licenses behavior analysts as "Behavior Specialists", under the
 * State Board of Medicine. The Department sells the whole list ($71 to set up,
 * then half a cent a name), and PALS gives the same people away one search at
 * a time. Its search page calls a small JSON endpoint that needs no login, no
 * cookies and -- as things stand, `ShowCaptcha` being off -- no CAPTCHA. If
 * that changes the answer stops being a list and the fetch says so.
 *
 * What shapes the code:
 * - **A search answers 50 people a page, and never more than 500.** The count
 *   is on every row (`TotalRecords`), and it stops at 500 however many match, so
 *   a search that says 500 is cut short. It is split by the next letter of the
 *   last name (matched as a prefix) until each piece says less.
 * - **There is no expiry date**, only a status -- Active, Expired, Inactive,
 *   Suspension, Revocation -- so a license is only as current as the status says.
 * - **Every row carries the person's phone and email.** None of it is kept.
 */

export const PA_SEARCH_URL = 'https://www.pals.pa.gov/api/Search/SearchForPersonOrFacilty';
export const PA_SITE_URL = 'https://www.pals.pa.gov/#!/page/search';
/** PALS's own numbers for "State Board of Medicine" and "Behavior Specialist". */
export const PA_PROFESSION_ID = 37;
export const PA_LICENSE_TYPE_ID = 180;
export const PA_PAGE_SIZE = 50;
/** The most a search will report. A search that says this is not the whole answer. */
export const PA_RESULT_CAP = 500;

/** One page of one search: everyone of this license type, optionally only last names starting `prefix`. */
export function paSearchBody({ prefix = '', page = 1 }) {
  return {
    OptPersonFacility: 'Person',
    ProfessionID: PA_PROFESSION_ID,
    LicenseTypeId: PA_LICENSE_TYPE_ID,
    ...(prefix ? { LastName: prefix } : {}),
    State: '',
    Country: 'ALL',
    County: null,
    IsFacility: 0,
    PersonId: null,
    PageNo: page,
  };
}

/** The columns a sweep is written as -- and read back from. Nothing that could reach a person: no address, phone or email. */
export const PA_CSV_HEADERS = ['License Number', 'License Type', 'Board', 'Status', 'First Name', 'Middle Name', 'Last Name', 'Suffix', 'City', 'State', 'County'];

export function paRow(person) {
  const text = (value) => String(value ?? '').trim();
  return {
    'License Number': text(person.LicenseNumber),
    'License Type': text(person.LicenceType),
    Board: text(person.BoardName),
    Status: text(person.Status),
    'First Name': text(person.FirstName),
    'Middle Name': text(person.MiddleName),
    'Last Name': text(person.LastName),
    Suffix: text(person.NameSuffix),
    City: text(person.City),
    State: text(person.State),
    County: text(person.County),
  };
}

/**
 * Everyone the search will give up.
 *
 * `searchPage(prefix, page)` asks once and resolves with that page's people
 * (none past the last page). One person is one license number, so one found
 * under two searches is counted once.
 *
 * @param {(prefix: string, page: number) => Promise<Object[]>} searchPage
 * @returns {Promise<Object[]>} People as PALS returns them, before `paRow`.
 */
export async function collectPa(searchPage) {
  const MOST_LETTERS = 6;
  const found = new Map();
  const keep = (people) => {
    for (const person of people) found.set(person.LicenseNumber ?? person.LicenseId, person);
  };

  async function within(prefix) {
    const first = await searchPage(prefix, 1);
    if (first.length === 0) return;

    const total = first[0].TotalRecords ?? first.length;
    if (total >= PA_RESULT_CAP) {
      if (prefix.length >= MOST_LETTERS) {
        throw new Error(`PALS reported only part of the last names starting "${prefix.toUpperCase()}", and they could not be split further.`);
      }
      for (const letter of 'abcdefghijklmnopqrstuvwxyz') await within(prefix + letter);
      return;
    }

    keep(first);
    for (let page = 2; (page - 1) * PA_PAGE_SIZE < total; page += 1) keep(await searchPage(prefix, page));
  }

  await within('');
  return [...found.values()];
}

const REQUIRED = ['License Number', 'License Type', 'Board', 'Status', 'First Name', 'Last Name', 'County'];
const BEHAVIOR_SPECIALIST = /behavior specialist/i;

/** Recognised by its headers, never its file name. */
export function identifyPaLicenseFile(headers) {
  const present = new Set((headers ?? []).map(normalizeHeader));
  return REQUIRED.every((column) => present.has(normalizeHeader(column)));
}

/**
 * Pennsylvania's Behavior Specialists in the shape License Check matches on.
 * There is no expiry date to give: whether a license is current is whatever its
 * status says. Only Active reads as a live license; Inactive, Suspension and
 * Revocation are shown as they are, for someone to look at.
 *
 * @param {Object[]} rows
 */
export function toPaLicenseRecords(rows) {
  const read = (row, name) => {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(name));
    return key === undefined ? '' : String(row[key] ?? '').trim();
  };

  return rows
    .filter((row) => BEHAVIOR_SPECIALIST.test(read(row, 'License Type')))
    .map((row) => ({
      jurisdiction: 'PA',
      number: read(row, 'License Number'),
      type: read(row, 'License Type'),
      status: read(row, 'Status'),
      firstName: read(row, 'First Name'),
      middleName: read(row, 'Middle Name'),
      lastName: read(row, 'Last Name'),
      suffix: read(row, 'Suffix'),
      city: read(row, 'City'),
      state: read(row, 'State'),
      expires: null,
    }))
    .filter((license) => license.number !== '');
}
