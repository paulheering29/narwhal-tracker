import { writeFile } from 'node:fs/promises';
import { toCsv } from '@sysreview/core';

/** Excel reads a UTF-8 CSV as Latin-1 unless it opens with this, and mangles every accent. */
const BYTE_ORDER_MARK = '\uFEFF';

/**
 * A table the window has already arranged -- sorted, filtered, in the order the
 * person sees it -- written to a CSV. The window holds that view, so it sends
 * the finished rows rather than this process re-deriving them.
 *
 * @param {{ headers: string[], rows: (string|number|null)[][] }} sheet
 * @param {string} path
 */
export async function exportCsv(sheet, path) {
  if (!Array.isArray(sheet?.headers) || !Array.isArray(sheet?.rows) || !sheet.rows.every(Array.isArray)) {
    throw new Error('There is nothing to export.');
  }
  await writeFile(path, BYTE_ORDER_MARK + toCsv(sheet.headers, sheet.rows), 'utf8');
  return { saved: true };
}
