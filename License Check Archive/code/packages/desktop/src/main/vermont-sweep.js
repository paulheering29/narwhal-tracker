import ExcelJS from 'exceljs';
import {
  VT_HOST,
  VT_START_URL,
  VT_BROWSER_HEADERS,
  VT_LICENSE_TYPES,
  VT_PROFESSION,
  VT_STATUS_COUNT,
  readVtStart,
  readVtActions,
  readVtValueTokens,
  vtTabRequest,
  vtChoiceRequest,
  vtTickRequest,
  vtStatusRefreshRequest,
  vtDownloadRequest,
  vtSpreadsheetUrl,
  vtRow,
} from '@sysreview/core';
import { openFormSession } from './state-web-form.js';

/**
 * Vermont's Behavior Analysts, asked of the Office of Professional Regulation's
 * roster download the way its own page asks (see core's vermont.js). About forty
 * requests in one guest session, which the site gives to anyone without a login.
 */

const MAX_BYTES = 5_000_000;
const PAUSE_MS = 150;
const ZIP_MAGIC = [0x50, 0x4b]; // an .xlsx is a zip; anything else is a page telling us it did not work

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

/** The lines of an Excel roster's first sheet, keyed by its header row. */
async function rosterLines(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers = [];
  sheet.getRow(1).eachCell((cell, column) => {
    headers[column] = String(cell.text ?? '').trim();
  });
  const lines = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const line = {};
    row.eachCell((cell, column) => {
      if (headers[column]) line[headers[column]] = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : String(cell.text ?? '');
    });
    lines.push(line);
  });
  return lines;
}

/** @returns {Promise<Object[]>} Rows of VT_CSV_HEADERS, one per license, of every type. */
export async function sweepVermont() {
  const site = openFormSession(VT_HOST, { maxBytes: MAX_BYTES });
  const start = await site.get(VT_START_URL);
  const session = readVtStart(start.html, start.url);
  if (!session?.sections.FindAProfessionalWrapper) {
    throw new Error("Vermont's roster page wasn't in the form we expected.");
  }
  const headers = { ...VT_BROWSER_HEADERS, pzCTkn: session.csrf };
  const send = async ({ url, body }) => {
    const page = await site.post(url, body, headers);
    await pause();
    return page;
  };

  // The roster page, and the tokens it issues for the choices made on it.
  const roster = await send(vtTabRequest(session));
  session.actions = readVtActions(roster.html);
  const tokens = readVtValueTokens(roster.html);
  if (!tokens.profession || !tokens.status || !tokens.type || !session.actions.statuses || !session.actions.download || !session.actions.spreadsheetPath) {
    throw new Error("Vermont's roster page no longer offers what the download needs.");
  }

  await send(vtChoiceRequest(session, { property: 'ProductIds', value: VT_PROFESSION, token: tokens.profession }));
  for (let nth = 1; nth <= VT_STATUS_COUNT; nth += 1) {
    await send(vtTickRequest(session, tokens, nth));
    await send(vtStatusRefreshRequest(session, nth));
  }

  const rows = [];
  for (const type of VT_LICENSE_TYPES) {
    await send(vtChoiceRequest(session, { property: 'SetProfessionType', value: type.id, token: tokens.type }));
    await send(vtDownloadRequest(session));
    const file = await site.get(vtSpreadsheetUrl(session));
    if (!ZIP_MAGIC.every((byte, at) => file.buffer[at] === byte)) throw new Error("Vermont's site did not give a spreadsheet.");
    for (const line of await rosterLines(file.buffer)) rows.push(vtRow(line, type.name));
  }
  return rows.filter((row) => row['License Number'] !== '');
}
