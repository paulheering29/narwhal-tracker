import Papa from 'papaparse';

/**
 * A table as CSV text, ready for Excel.
 *
 * `escapeFormulae` matters because these cells come out of somebody else's
 * export: a name or code that starts with = + - or @ would otherwise be run as
 * a formula when the file is opened in a spreadsheet.
 *
 * @param {string[]} headers
 * @param {(string|number|null)[][]} rows
 */
export function toCsv(headers, rows) {
  return Papa.unparse({ fields: headers, data: rows }, { escapeFormulae: true, newline: '\r\n' });
}
