import { normalizeHeader } from '../csv/columns.js';
import { toIsoDate } from '../ar/records.js';
import { splitPlainName } from './names.js';

/**
 * The Connecticut Department of Public Health's credential data.
 *
 * Connecticut publishes every state credential as an open dataset on
 * data.ct.gov, refreshed daily, with a public query API. Behavior analysts are
 * `credential` "Behavior Analyst".
 *
 * A person is one ALL-CAPS "FIRST MIDDLE LAST" column with nothing to say where
 * the last name starts, so it is taken to be the last word (see splitPlainName).
 *
 * Statuses that need reading:
 * - INACTIVE with the reason "LAPSED DUE TO NON-RENEWAL" is a license that ran
 *   out -- it is recorded as Lapsed, which is what it is;
 * - ACTIVE IN RENEWAL is licensed with a renewal under way; if its date has
 *   already passed it is left for a person to look at, not called expired;
 * - EXPIRED APPLICATION is an application that came to nothing, and is dropped.
 */

const REQUIRED = ['credentialnumber', 'name', 'credential', 'status', 'expirationdate'];
const BEHAVIOR_ANALYST = /behavior analyst/i;

/** Recognised by its headers, never its file name. */
export function identifyCtLicenseFile(headers) {
  const present = new Set((headers ?? []).map(normalizeHeader));
  return REQUIRED.every((column) => present.has(normalizeHeader(column)));
}

/** @param {Object[]} rows */
export function toCtLicenseRecords(rows) {
  const read = (row, name) => {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(name));
    return key === undefined ? '' : String(row[key] ?? '').trim();
  };

  return rows
    .filter((row) => BEHAVIOR_ANALYST.test(read(row, 'credential')))
    // One credential in the dataset belongs to a corporation, not a person.
    .filter((row) => (read(row, 'type') || 'INDIVIDUAL').toUpperCase() === 'INDIVIDUAL')
    .filter((row) => read(row, 'status').toUpperCase() !== 'EXPIRED APPLICATION')
    .map((row) => {
      const status = read(row, 'status');
      const lapsed = status.toUpperCase() === 'INACTIVE' && /lapsed/i.test(read(row, 'statusreason'));
      return {
        jurisdiction: 'CT',
        number: read(row, 'credentialnumber'),
        type: read(row, 'credential'),
        status: lapsed ? 'Lapsed' : status,
        ...splitPlainName(read(row, 'name')),
        city: read(row, 'city'),
        state: read(row, 'state'),
        expires: toIsoDate(read(row, 'expirationdate')),
      };
    })
    .filter((license) => license.number !== '');
}

/** The address that returns just the behavior analysts. */
export function ctExtractUrl() {
  const query = new URLSearchParams({
    $select: 'credentialnumber,name,credential,type,status,statusreason,expirationdate,city,state',
    $where: "credential = 'Behavior Analyst'",
    $order: 'credentialnumber',
    $limit: '50000',
  });
  return `https://data.ct.gov/resource/ngch-56tr.csv?${query}`;
}
