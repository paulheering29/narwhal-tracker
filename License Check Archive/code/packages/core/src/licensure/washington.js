import { normalizeHeader } from '../csv/columns.js';
import { toIsoDate } from '../ar/records.js';

/**
 * The Washington State Department of Health's credential data.
 *
 * Washington publishes every health credential it issues as an open dataset on
 * data.wa.gov, refreshed daily, with a public query API -- so the list can be
 * asked for by credential type and comes back as one small CSV. It carries a
 * birth year for each person, which is never asked for.
 *
 * Three behavior analyst credentials are licensed: Licensed Behavior Analyst,
 * Licensed Assistant Behavior Analyst and a temporary license. "Certified
 * Behavior Technician" -- the RBT-level credential, by far the biggest group --
 * is a different thing and is left out.
 *
 * Not every row is a person's current license:
 * - Superseded is an assistant credential replaced by a full license; the
 *   full license is the one that says where they stand, so it is dropped;
 * - Closed and Denied are applications that came to nothing;
 * - Pending is an application in progress, and is kept, so that someone who is
 *   partway there shows as needing review and not as missing.
 */

const REQUIRED = ['credentialnumber', 'credentialtype', 'status', 'expirationdate', 'firstname', 'lastname'];
const BEHAVIOR_ANALYST = /behavior analyst/i;
const NOT_A_LICENSE = new Set(['superseded', 'closed', 'denied']);

/** Recognised by its headers, never its file name. */
export function identifyWaLicenseFile(headers) {
  const present = new Set((headers ?? []).map(normalizeHeader));
  return REQUIRED.every((column) => present.has(normalizeHeader(column)));
}

/**
 * The behavior analysts in an extract, in the shape License Check matches on.
 * Anything else the dataset holds -- other professions, birth years -- is left
 * behind, so the whole dataset can be uploaded as well as the small extract.
 *
 * @param {Object[]} rows  Parsed rows of the extract.
 */
export function toWaLicenseRecords(rows) {
  const read = (row, name) => {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(name));
    return key === undefined ? '' : String(row[key] ?? '').trim();
  };

  return rows
    .filter((row) => BEHAVIOR_ANALYST.test(read(row, 'credentialtype')))
    .filter((row) => !NOT_A_LICENSE.has(read(row, 'status').toLowerCase()))
    .map((row) => ({
      jurisdiction: 'WA',
      number: read(row, 'credentialnumber'),
      type: read(row, 'credentialtype'),
      status: read(row, 'status'),
      firstName: read(row, 'firstname'),
      middleName: read(row, 'middlename'),
      lastName: read(row, 'lastname'),
      suffix: '',
      city: '',
      state: '',
      expires: toIsoDate(read(row, 'expirationdate')),
    }))
    .filter((license) => license.number !== '');
}

/**
 * The address that returns just the behavior analysts, as CSV. The same public
 * address anyone can build on data.wa.gov -- no key, no login. Asking for the
 * columns by name is what keeps the birth year out of it.
 */
export function waExtractUrl() {
  const query = new URLSearchParams({
    $select: 'credentialnumber,lastname,firstname,middlename,credentialtype,status,firstissuedate,lastissuedate,expirationdate,actiontaken',
    $where: "upper(credentialtype) like '%BEHAVIOR ANALYST%'",
    $order: 'credentialnumber',
    $limit: '50000',
  });
  return `https://data.wa.gov/resource/qxh8-f4bd.csv?${query}`;
}
