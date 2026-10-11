import { normalizeHeader } from '../csv/columns.js';
import { toIsoDate } from '../ar/records.js';

/**
 * The Rhode Island Department of Health licensee extract.
 *
 * One CSV per profession, or -- when no profession is chosen -- every license
 * in the state, food service and pharmacies included (about 140,000 rows). Only
 * Active licenses are published. There is no id shared with CentralReach, so a
 * person can only be found by name.
 */

const REQUIRED = ['License No', 'Profession', 'License Type', 'Status', 'Issue Date', 'Expiration Date', 'First', 'Last'];

/**
 * Both types sit under one profession, "Applied Behavior Analyst" -- the second
 * type is spelled "Applied Behavior Assistant Analyst", which a search for
 * "behavior analyst" would miss, so it is the profession that is asked.
 */
const BEHAVIOR_ANALYST = /behavior analyst/i;

/** Recognised by its headers, never its file name. */
export function identifyRiLicenseFile(headers) {
  const present = new Set((headers ?? []).map(normalizeHeader));
  return REQUIRED.every((column) => present.has(normalizeHeader(column)));
}

/**
 * The behavior analysts in an extract, in the shape License Check matches on.
 * Whatever else the extract holds is left behind -- including the business
 * phone and fax numbers it carries, which nothing here has any use for.
 *
 * @param {Object[]} rows  Parsed rows of the extract.
 */
export function toRiLicenseRecords(rows) {
  const read = (row, name) => {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(name));
    return key === undefined ? '' : String(row[key] ?? '').trim();
  };

  return rows
    .filter((row) => BEHAVIOR_ANALYST.test(read(row, 'Profession')))
    .map((row) => {
      const state = read(row, 'State');
      return {
        jurisdiction: 'RI',
        number: read(row, 'License No'),
        type: read(row, 'License Type'),
        status: read(row, 'Status'),
        firstName: read(row, 'First'),
        middleName: read(row, 'Middle'),
        lastName: read(row, 'Last'),
        suffix: '',
        city: read(row, 'City'),
        // "NA" is what the state writes when there is no address, not a place.
        state: state === 'NA' ? '' : state,
        expires: toIsoDate(read(row, 'Expiration Date')),
      };
    })
    .filter((license) => license.number !== '');
}

/**
 * When an extract was made, from the name it downloads under
 * ("Applied-Behavior-Analyst-licensee-extract-2026-09-20.csv"). Null once
 * someone has renamed it.
 */
export function riExportDate(fileName) {
  return String(fileName ?? '').match(/licensee-extract-(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

/**
 * Where the extract is fetched from -- the same address the state's own
 * Licensee Lists page posts to when its Download button is pressed. Asking for
 * "Applied Behavior Analyst" returns just those people (a few hundred rows);
 * asking for nothing returns the whole state.
 */
export const RI_EXTRACT_URL = 'https://datahealth.ri.gov/lists/licensees/download.php';
export const RI_PROFESSION = 'Applied Behavior Analyst';
