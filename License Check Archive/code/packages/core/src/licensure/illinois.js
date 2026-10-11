import { normalizeHeader } from '../csv/columns.js';
import { toIsoDate } from '../ar/records.js';

/**
 * The Illinois Department of Financial and Professional Regulation's license data.
 *
 * IDFPR publishes every license it issues as an open dataset with a public
 * query API. Behavior analysts are not named in its `license_type` (that is
 * "ADVISORY BD OF BEHAV") but in `description`, and spelled "BEHAVIORAL
 * ANALYST" -- a search for "behavior analyst" finds none of them.
 *
 * Nearly every row is ACTIVE (2,407 of 2,410 when this was written): licensing
 * began only in 2025, and lapsed licenses are rare in what it publishes.
 */

const REQUIRED = ['license_number', 'license_status', 'description', 'first_name', 'last_name', 'expiration_date'];
const BEHAVIORAL_ANALYST = /behavior(al)? analyst/i;

/** Recognised by its headers, never its file name. */
export function identifyIlLicenseFile(headers) {
  const present = new Set((headers ?? []).map(normalizeHeader));
  return REQUIRED.every((column) => present.has(normalizeHeader(column)));
}

/** @param {Object[]} rows */
export function toIlLicenseRecords(rows) {
  const read = (row, name) => {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(name));
    return key === undefined ? '' : String(row[key] ?? '').trim();
  };

  return rows
    .filter((row) => BEHAVIORAL_ANALYST.test(read(row, 'description')))
    .map((row) => ({
      jurisdiction: 'IL',
      number: read(row, 'license_number'),
      type: read(row, 'description'),
      status: read(row, 'license_status'),
      firstName: read(row, 'first_name'),
      middleName: read(row, 'middle'),
      lastName: read(row, 'last_name'),
      suffix: read(row, 'suffix'),
      city: read(row, 'city'),
      state: read(row, 'state'),
      expires: toIsoDate(read(row, 'expiration_date')),
    }))
    .filter((license) => license.number !== '');
}

/** The address that returns just the behavior analysts. */
export function ilExtractUrl() {
  const query = new URLSearchParams({
    $select: 'license_number,description,license_status,first_name,middle,last_name,suffix,expiration_date,city,state',
    $where: "upper(description) like '%BEHAVIORAL ANALYST%'",
    $order: 'license_number',
    $limit: '50000',
  });
  return `https://data.illinois.gov/resource/pzzh-kp68.csv?${query}`;
}
