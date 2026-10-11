import Papa from 'papaparse';
import { findDuplicateHeaders } from './columns.js';

const cleanHeader = (h) => String(h ?? '').replace(/^﻿/, '').trim();

/**
 * Parse CSV text into rows. Synchronous and in-memory on purpose: this runs in
 * the desktop app's main process and the result never leaves the machine.
 *
 * @param {string} text
 * @param {{ maxRows?: number }} [opts]
 * @returns {{
 *   headers: string[],
 *   rows: Object[],
 *   duplicateHeaders: string[],
 *   parseErrors: {row: number, message: string}[],
 *   truncated: boolean
 * }}
 */
export function parseCsv(text, opts = {}) {
  // Papaparse renames duplicate headers ("Name" -> "Name_1") before we ever see
  // meta.fields, so read the raw header row first to catch them. A renamed
  // column still holds its data, but a check asking for "Name" would silently
  // bind to only the first of the two -- worth telling the user about.
  const headerRow = Papa.parse(text, { header: false, preview: 1 }).data?.[0] ?? [];
  const duplicateHeaders = findDuplicateHeaders(headerRow.map(cleanHeader).filter(Boolean));

  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    // Everything stays a string. Checks decide how to interpret a value;
    // silent coercion is how leading zeros on member IDs get destroyed.
    dynamicTyping: false,
    transformHeader: cleanHeader,
  });

  const headers = result.meta?.fields ?? [];
  let rows = result.data ?? [];
  let truncated = false;

  if (opts.maxRows && rows.length > opts.maxRows) {
    rows = rows.slice(0, opts.maxRows);
    truncated = true;
  }

  const parseErrors = (result.errors ?? []).map((e) => ({
    // Papa rows are 0-based over data rows; +2 puts it where Excel shows it.
    row: typeof e.row === 'number' ? e.row + 2 : 0,
    message: e.message,
  }));

  return { headers, rows, duplicateHeaders, parseErrors, truncated };
}
