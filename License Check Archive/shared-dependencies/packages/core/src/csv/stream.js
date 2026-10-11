import Papa from 'papaparse';

const cleanHeader = (h) => String(h ?? '').replace(/^﻿/, '').trim();

/**
 * Parse a CSV from a Node Readable stream, one row at a time, keeping only
 * whatever `pickRow` returns for it rather than the full parsed row.
 *
 * `parseCsv` (see ./parse.js) is synchronous and holds the whole file, every
 * column of every row, in memory at once -- fine for what every other module
 * reads, and deliberately simple. It stops being fine for a file wide enough,
 * and rows-heavy enough, that even a moment of holding it at full width is
 * the problem: a CentralReach billing download can carry 180 columns and a
 * quarter of a million rows. This never holds more than one row at full
 * width at a time -- `pickRow` is expected to narrow it immediately, and the
 * rest of that row is garbage the moment `pickRow` returns.
 *
 * @param {NodeJS.ReadableStream} readable
 * @param {(row: Object, headers: string[]) => Object} pickRow
 * @returns {Promise<{ headers: string[], rows: Object[] }>}
 */
export function streamCsvProjected(readable, pickRow) {
  return new Promise((resolve, reject) => {
    let headers = [];
    const rows = [];

    Papa.parse(readable, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      transformHeader: cleanHeader,
      step: (result) => {
        if (headers.length === 0) headers = result.meta?.fields ?? [];
        rows.push(pickRow(result.data, headers));
      },
      error: reject,
      complete: () => resolve({ headers, rows }),
    });
  });
}

/** Just the header row, without reading anything past the first line. */
export function peekCsvHeaders(firstLine) {
  const parsed = Papa.parse(firstLine, { header: false }).data?.[0] ?? [];
  return parsed.map(cleanHeader).filter(Boolean);
}
