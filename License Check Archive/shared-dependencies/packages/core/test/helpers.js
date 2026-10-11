import { codesFileType, billingFileType } from '../src/files/types.js';
import { parseCsv, identifyFile, defaultPreferences } from '../src/index.js';
import { clientsFileType } from '../src/files/types.js';

export const CODES_HEADER = codesFileType.signature.join(',');

/** A codes row with only the columns a test cares about filled in. */
export function codesRow(values) {
  return codesFileType.signature.map((column) => values[column] ?? '').join(',');
}

export function codesCsv(...rows) {
  return [CODES_HEADER, ...rows].join('\n');
}

export const BILLING_HEADER = billingFileType.signature.join(',');

/** A billing row with only the columns a test cares about filled in. */
export function billingRow(values) {
  return billingFileType.signature.map((column) => values[column] ?? '').join(',');
}

export function billingCsv(...rows) {
  return [BILLING_HEADER, ...rows].join('\n');
}

/** Turn CSV text into the shape runReport expects. */
export function asFile(text, name = 'file.csv') {
  const parsed = parseCsv(text);
  const { fileType, problem } = identifyFile(parsed.headers, parsed.rows);
  return { key: name, name, fileType, problem, parsed };
}

export const CONTACT_HEADER = clientsFileType.signature.join(',');

/** A clients/staff row. Pass TypeId and Type to say which it is. */
export function contactRow(values) {
  return clientsFileType.signature.map((column) => values[column] ?? '').join(',');
}

export const clientRow = (values) => contactRow({ TypeId: '20', Type: 'client', ...values });
export const staffRow = (values) => contactRow({ TypeId: '572', Type: 'employee', ...values });

export const contactCsv = (...rows) => [CONTACT_HEADER, ...rows].join('\n');

export const outcomeFor = (report, id) => report.outcomes.find((o) => o.checkId === id);

/**
 * Preferences with only these checks switched on.
 *
 * A test about scoring or history should not start failing because someone
 * added an unrelated check, so it says which ones it means.
 */
export function onlyChecks(...ids) {
  const prefs = defaultPreferences();
  for (const [id, config] of Object.entries(prefs.checks)) {
    config.enabled = ids.includes(id);
  }
  return prefs;
}
