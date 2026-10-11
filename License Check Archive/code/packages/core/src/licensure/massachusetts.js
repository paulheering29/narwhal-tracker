import { normalizeHeader } from '../csv/columns.js';
import { toIsoDate } from '../ar/records.js';

/**
 * The Massachusetts license download.
 *
 * The state's Bureau of Health Professions Licensure publishes a ZIP per
 * license type -- a data CSV and a small metadata CSV describing its columns --
 * and treats the data as primary source verification. There is no shared id
 * with CentralReach, so a person can only be found by name.
 */

const REQUIRED = [
  'License Number', 'License Type', 'License Status', 'First Name', 'Last Name', 'Expiration Date',
];

/** Recognised by its headers, never its file name -- people rename downloads. */
export function identifyMassLicenseFile(headers) {
  const present = new Set((headers ?? []).map(normalizeHeader));
  return REQUIRED.every((column) => present.has(normalizeHeader(column)));
}

/**
 * The license rows in a shape that does not care which state they came from,
 * so the next state is a new reader and not a new matcher.
 *
 * @param {Object[]} rows  Parsed rows of the data CSV.
 * @returns {{ jurisdiction: string, number: string, type: string, status: string,
 *   firstName: string, middleName: string, lastName: string, suffix: string,
 *   city: string, state: string, expires: string|null }[]}
 */
export function toMassLicenseRecords(rows) {
  const read = (row, name) => {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(name));
    return key === undefined ? '' : String(row[key] ?? '').trim();
  };

  return rows
    .map((row) => ({
      jurisdiction: 'MA',
      number: read(row, 'License Number'),
      type: read(row, 'License Type'),
      status: read(row, 'License Status'),
      firstName: read(row, 'First Name'),
      middleName: read(row, 'Middle Name'),
      lastName: read(row, 'Last Name'),
      suffix: read(row, 'Suffix'),
      city: read(row, 'City'),
      state: read(row, 'State'),
      expires: toIsoDate(read(row, 'Expiration Date')),
    }))
    .filter((license) => license.number !== '');
}

/**
 * When the state generated a file, from the name it downloads under
 * ("...Export_2026-09-20T06_14_28.872Z.zip"). Null once someone has renamed it.
 */
export function massExportDate(fileName) {
  return String(fileName ?? '').match(/(\d{4}-\d{2}-\d{2})T\d{2}_\d{2}/)?.[1] ?? null;
}

/**
 * Where the state publishes its downloads. The same public addresses its own
 * "Download License Data" page uses -- no key, no login. Fixed here rather than
 * configurable: the app only ever asks for the two files it needs, from the one
 * place it means to.
 */
const MASS_API = 'https://healthprofessionlicensing-api.mass.gov/api-public';
export const MASS_EXPORT_LIST_URL = `${MASS_API}/export/all`;
export const massExportUrl = (id) => `${MASS_API}/export/data/license/${encodeURIComponent(id)}`;

/**
 * The behavior analyst downloads in the state's list of everything it publishes.
 *
 * Found by name, not by number: the list says which download has which id, so
 * if the state ever renumbers them this still finds the right ones. The board's
 * own combined file and every other profession are left alone.
 *
 * @param {unknown} listing  The parsed JSON of MASS_EXPORT_LIST_URL.
 * @returns {{ id: number, name: string, createdDate: string|null, sizeInBytes: number }[]}
 */
export function pickMassBehaviorAnalystExports(listing) {
  if (!Array.isArray(listing)) return [];
  return listing
    .filter(
      (item) =>
        item &&
        item.visible !== false &&
        Number.isInteger(item.licenseMetaId) &&
        typeof item.name === 'string' &&
        /behavior_analyst_license_export/i.test(item.name),
    )
    .map((item) => ({
      id: item.licenseMetaId,
      name: item.name,
      createdDate: typeof item.createdDate === 'string' ? item.createdDate : null,
      sizeInBytes: Number(item.sizeInBytes) || 0,
    }));
}

/**
 * A download's name without the moment it was made -- "Licensed_Applied_
 * Behavior_Analyst_License" for every day's copy -- so a newer download of the
 * same license type replaces the older one instead of sitting beside it.
 */
export function massExportKey(fileName) {
  return String(fileName ?? '').replace(/_Export_.*$/, '').replace(/\.(zip|csv)$/i, '');
}
