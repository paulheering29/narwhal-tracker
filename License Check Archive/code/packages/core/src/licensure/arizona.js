import { normalizeHeader } from '../csv/columns.js';
import { toIsoDate } from '../ar/records.js';

/**
 * The Arizona Board of Psychologist Examiners public registry export.
 *
 * Its "Download (.csv)" button gives a file called Export.csv holding every
 * behavior analyst the Board has ever licensed -- expired, revoked and deceased
 * included, with a status and an expiry date on each. It only ever comes to a
 * web browser: the site refuses everything else, so it has to be downloaded by
 * hand and dropped in.
 *
 * The file has a few habits worth knowing about:
 * - its first header has a space in front of the opening quote, which stops a
 *   CSV reader seeing it as quoted, and "License Status" is written with two
 *   HTML `&nbsp;` codes on the end;
 * - a last name may carry a credential -- "Aguilar, Ph.D.", "Smith, Jr." -- and
 *   a city a stray trailing comma;
 * - the registry has a few test records ("test", "BEH-TEST123").
 */

const REQUIRED = ['License Number', 'First Name', 'Last Name', 'License Type', 'License Status', 'License Expiry Date'];
const BEHAVIOR_ANALYST = /behavior analyst/i;

/**
 * Put right the two things about the header that stop it being read: leading
 * whitespace before the first quote, and `&nbsp;` codes. Anything that is not
 * plainly Arizona's file is returned untouched.
 */
export function tidyAzText(text) {
  const start = String(text ?? '').slice(0, 400);
  if (!/License Number/i.test(start) || !/License Expiry Date/i.test(start)) return text;
  return text.replace(/^\s+/, '').replace(/&nbsp;/g, ' ');
}

/** Recognised by its headers, never its file name -- it arrives as "Export.csv" or a string of letters. */
export function identifyAzLicenseFile(headers) {
  const present = new Set((headers ?? []).map(normalizeHeader));
  return REQUIRED.every((column) => present.has(normalizeHeader(column)));
}

/**
 * The behavior analysts in an export, in the shape License Check matches on.
 *
 * The file has no state column -- everyone in it is Arizona's -- so `state` is
 * empty. A credential after a comma in the last name ("Aguilar, Ph.D.") is
 * moved to `suffix`, since a name must be compared without it.
 *
 * @param {Object[]} rows  Parsed rows of the export, from tidied text.
 */
export function toAzLicenseRecords(rows) {
  const read = (row, name) => {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(name));
    return key === undefined ? '' : String(row[key] ?? '').trim();
  };

  return rows
    .map((row) => {
      const [lastName, ...credentials] = read(row, 'Last Name').split(',').map((part) => part.trim());
      return {
        jurisdiction: 'AZ',
        number: read(row, 'License Number'),
        type: read(row, 'License Type'),
        status: read(row, 'License Status'),
        firstName: read(row, 'First Name'),
        middleName: '',
        lastName,
        suffix: credentials.filter(Boolean).join(', '),
        city: read(row, 'City').replace(/,\s*$/, ''),
        state: '',
        expires: toIsoDate(read(row, 'License Expiry Date')),
      };
    })
    .filter((license) => BEHAVIOR_ANALYST.test(license.type))
    // The registry holds a few records people made to try it out.
    .filter((license) => license.number !== '' && !/test/i.test(license.number));
}
