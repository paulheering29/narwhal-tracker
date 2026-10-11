import { normalizeHeader } from '../csv/columns.js';
import { toIsoDate } from '../ar/records.js';
import { splitCommaName } from './names.js';

/**
 * The Texas Department of Licensing and Regulation's license data.
 *
 * Texas licenses behavior analysts through TDLR, not the Behavioral Health
 * Executive Council. TDLR publishes every license it issues as an open dataset
 * on data.texas.gov, refreshed daily, with a public query API -- so the
 * behavior analysts can be asked for by name and come back as one small CSV.
 *
 * Two things about it matter:
 * - **It has no status column.** All it says about a license is when it
 *   expires. About one in five behavior analyst rows is already past that date,
 *   so those read as expired; but a license that has been suspended or revoked
 *   and has not yet expired would read as current. That is worth knowing, and
 *   the report says so.
 * - **A person is a single "LAST, FIRST MIDDLE" column.**
 *
 * The dataset also carries each license's addresses and phone numbers. Only four
 * columns are ever asked for.
 */

const REQUIRED = ['license_type', 'license_number', 'owner_name', 'license_expiration_date_mmddccyy'];
const BEHAVIOR_ANALYST = /behavior analyst/i;

/** Recognised by its headers, never its file name. */
export function identifyTxLicenseFile(headers) {
  const present = new Set((headers ?? []).map(normalizeHeader));
  return REQUIRED.every((column) => present.has(normalizeHeader(column)));
}

/**
 * The behavior analysts in an extract. `status` is empty by design: the state
 * does not say, and inventing one would be inventing what it says.
 *
 * @param {Object[]} rows
 */
export function toTxLicenseRecords(rows) {
  const read = (row, name) => {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(name));
    return key === undefined ? '' : String(row[key] ?? '').trim();
  };

  return rows
    .filter((row) => BEHAVIOR_ANALYST.test(read(row, 'license_type')))
    .map((row) => ({
      jurisdiction: 'TX',
      number: read(row, 'license_number'),
      type: read(row, 'license_type'),
      status: '',
      ...splitCommaName(read(row, 'owner_name')),
      city: '',
      state: '',
      expires: toIsoDate(read(row, 'license_expiration_date_mmddccyy')),
    }))
    .filter((license) => license.number !== '');
}

/** The address that returns just the behavior analysts, four columns wide -- no addresses, no phone numbers. */
export function txExtractUrl() {
  const query = new URLSearchParams({
    $select: 'license_type,license_number,owner_name,license_expiration_date_mmddccyy',
    $where: "upper(license_type) like '%BEHAVIOR ANALYST%'",
    $order: 'license_number',
    $limit: '50000',
  });
  return `https://data.texas.gov/resource/7358-krk7.csv?${query}`;
}
