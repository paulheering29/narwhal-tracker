import { normalizeHeader } from '../csv/columns.js';
import { toIsoDate } from '../ar/records.js';

/**
 * The New Jersey Division of Consumer Affairs bulk roster.
 *
 * A pipe-delimited text file, named just "Data.txt", one row per person, with no
 * date anywhere in it. Unlike Rhode Island's it holds every status: the license
 * numbers of people whose license has expired sit beside active ones, and beside
 * them again are applicants who have no license number yet.
 *
 * The file carries each person's email address. It is dropped on the way in --
 * nothing here has any use for it.
 */

const REQUIRED = ['license_no', 'license_status_name', 'license_type_name', 'profession_name', 'first_name', 'last_name', 'expiration_date'];

const BEHAVIOR_ANALYST = /behavior analyst/i;

/**
 * An application that was withdrawn, or a record that was deleted, is not a
 * license and not a live application. Everything else -- Active, Expired,
 * Inactive, Pending, Reinstatement Pending -- says something about the person.
 */
const NOT_A_LICENSE = new Set(['withdrawn', 'deleted']);

/** Recognised by its headers, never its file name: it is called "Data.txt". */
export function identifyNjLicenseFile(headers) {
  const present = new Set((headers ?? []).map(normalizeHeader));
  return REQUIRED.every((column) => present.has(normalizeHeader(column)));
}

/**
 * The behavior analysts in the roster, in the shape License Check matches on.
 *
 * An applicant has no license number and no dates, so `number` is empty and
 * `expires` is null; the status ("Pending") is what says what they are.
 *
 * @param {Object[]} rows  Parsed rows of the roster.
 */
export function toNjLicenseRecords(rows) {
  const read = (row, name) => {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(name));
    return key === undefined ? '' : String(row[key] ?? '').trim();
  };

  return rows
    .filter((row) => BEHAVIOR_ANALYST.test(read(row, 'profession_name')))
    .filter((row) => !NOT_A_LICENSE.has(read(row, 'license_status_name').toLowerCase()))
    .map((row) => ({
      jurisdiction: 'NJ',
      number: read(row, 'license_no'),
      type: read(row, 'license_type_name'),
      status: read(row, 'license_status_name'),
      firstName: read(row, 'first_name'),
      middleName: read(row, 'middle_name'),
      lastName: read(row, 'last_name'),
      suffix: read(row, 'name_suffix'),
      city: read(row, 'addr_city'),
      state: read(row, 'addr_state'),
      expires: toIsoDate(read(row, 'expiration_date')),
    }));
}

/**
 * Where the roster comes from. There is no address that returns it: the state
 * hands it out at the end of a short run of pages (search, results, a
 * confirmation that says the charge is $0.00, a choice of file type), each of
 * which must be given back the hidden fields the last one set. These are the
 * two things that start it.
 */
export const NJ_BULK_SEARCH_URL = 'https://newjersey.mylicense.com/Verification_Bulk/Search.aspx?facility=N';
export const NJ_PROFESSION = 'Applied Behavior Analysts';
