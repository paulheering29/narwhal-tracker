import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import JSZip from 'jszip';
import { openFormSession } from './state-web-form.js';
import { sweepOhio } from './ohio-sweep.js';
import { sweepPennsylvania } from './pennsylvania-sweep.js';
import { sweepVermont } from './vermont-sweep.js';
import {
  parseCsv,
  identifyFile,
  createColumnResolver,
  identifyMassLicenseFile,
  toMassLicenseRecords,
  massExportDate,
  massExportKey,
  massExportUrl,
  pickMassBehaviorAnalystExports,
  MASS_EXPORT_LIST_URL,
  identifyTxLicenseFile,
  toTxLicenseRecords,
  txExtractUrl,
  identifyIlLicenseFile,
  toIlLicenseRecords,
  ilExtractUrl,
  identifyCtLicenseFile,
  toCtLicenseRecords,
  ctExtractUrl,
  identifyWaLicenseFile,
  toWaLicenseRecords,
  waExtractUrl,
  tidyAzText,
  identifyAzLicenseFile,
  toAzLicenseRecords,
  identifyVtLicenseFile,
  toVtLicenseRecords,
  VT_CSV_HEADERS,
  identifyPaLicenseFile,
  toPaLicenseRecords,
  PA_CSV_HEADERS,
  identifyOhLicenseFile,
  toOhLicenseRecords,
  OH_CSV_HEADERS,
  toCsv,
  identifyNjLicenseFile,
  toNjLicenseRecords,
  NJ_BULK_SEARCH_URL,
  NJ_PROFESSION,
  identifyRiLicenseFile,
  toRiLicenseRecords,
  riExportDate,
  RI_EXTRACT_URL,
  RI_PROFESSION,
  JURISDICTIONS,
  toStaffRecords,
  matchLicenses,
} from '@sysreview/core';

/**
 * The two things License Check needs: CentralReach's staff download -- the
 * people to check -- and license lists from the states to check them against.
 *
 * Which is which is read from the file itself, never its name. Massachusetts
 * publishes a ZIP holding the data and a small CSV describing its columns; it is
 * opened as downloaded, so nobody has to unzip anything. Rhode Island publishes
 * a CSV, and New Jersey a pipe-delimited text file called "Data.txt". A bare CSV
 * of any kind works too.
 *
 * There is one staff list -- a second replaces the first -- but any number of
 * license files, one or more per state. A newer download of the same list from
 * the same state replaces the older one. The match happens here: nothing about
 * anybody on the staff list is ever sent anywhere.
 *
 * A state's list can also be fetched directly (see fetchLicenseFilesFromState)
 * -- the same public lists its own site hands out, asked for the same way its
 * own page asks.
 *
 * Only behavior analyst licenses are used. The states also publish counselors,
 * therapists, food service and more, and a staff member who shares a name with
 * a counselor has not thereby been found.
 */

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const BEHAVIOR_ANALYST = /behavior analyst/i;

/** @type {{ name: string, sizeBytes: number, loadedAt: number, staff: Object[] } | null} */
let contacts = null;
/** @type {{ key: string, jurisdiction: string, name: string, sizeBytes: number, loadedAt: number, records: Object[], ignored: number, exportDate: string|null }[]} */
const licenseFiles = [];

export async function stageLicenseFiles(paths) {
  const failed = [];
  for (const path of Array.isArray(paths) ? paths : []) {
    try {
      await stageOne(String(path));
    } catch (error) {
      failed.push({ name: basename(String(path)), reason: error?.message ?? String(error) });
    }
  }
  return { files: describeLicenseFiles(), failed };
}

/** The CSVs in some bytes: every one inside a ZIP, or the bytes themselves. */
async function tablesIn(name, buffer) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return [{ name, text: buffer.toString('utf8') }];
  if (!lower.endsWith('.zip')) throw new Error(`${name} is not a CSV, a text file or a ZIP.`);

  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.csv'));
  if (entries.length === 0) throw new Error(`${name} has no CSV inside it.`);
  return Promise.all(entries.map(async (entry) => ({ name: basename(entry.name), text: await entry.async('string') })));
}

async function stageOne(path) {
  const name = basename(path);
  const info = await stat(path);
  if (info.size > MAX_FILE_BYTES) throw new Error(`${name} is too large. The limit is 100 MB.`);
  // A file can be dated by when it was saved if its name does not say -- New Jersey's is just "Data.txt".
  await stageBuffer(name, await readFile(path), info.size, localDate(info.mtime));
}

const listStates = () => Object.values(JURISDICTIONS).map((state) => state.name).join(' or ');

/**
 * File a license list, replacing an older download of the same list from the
 * same state -- otherwise last week's would sit beside today's and be counted
 * too. Which downloads are "the same list" is the reader's to say: `key`.
 */
function fileLicenses({ key, jurisdiction, name, sizeBytes, records, ignored, exportDate }) {
  const entry = { key, jurisdiction, name, sizeBytes, loadedAt: Date.now(), records, ignored, exportDate };
  const index = licenseFiles.findIndex((file) => file.key === key);
  if (index >= 0) licenseFiles[index] = entry;
  else licenseFiles.push(entry);
}

/**
 * How each state's file is recognised and read.
 *
 * `identify` says whether headers are that state's; `read` turns its rows into
 * the plain records the matcher uses, keeping only behavior analysts; `key` says
 * which downloads are "the same list" (a newer one replaces an older one); `dated`
 * says when it was made if its name tells; `needs` is what to say if a file of
 * that shape holds no behavior analysts. Adding a state is adding an entry.
 */
const READERS = [
  {
    code: 'MA', identify: identifyMassLicenseFile,
    read: (rows) => toMassLicenseRecords(rows).filter((license) => BEHAVIOR_ANALYST.test(license.type)),
    key: (name) => `MA:${massExportKey(name)}`,
    dated: (name, table) => massExportDate(name) ?? massExportDate(table.name),
    needs: 'License Check needs the Licensed Applied Behavior Analyst download.',
  },
  {
    code: 'RI', identify: identifyRiLicenseFile, read: toRiLicenseRecords, key: () => 'RI', dated: (name) => riExportDate(name),
    needs: `License Check needs the "${RI_PROFESSION}" list from Rhode Island's Licensee Lists page.`,
  },
  {
    code: 'NJ', identify: identifyNjLicenseFile, read: toNjLicenseRecords, key: () => 'NJ',
    needs: `License Check needs the "${NJ_PROFESSION}" list from New Jersey's bulk download page.`,
  },
  {
    code: 'AZ', identify: identifyAzLicenseFile, read: toAzLicenseRecords, key: () => 'AZ',
    needs: "License Check needs the list from the Behavior Analyst search on Arizona's registry.",
  },
  {
    code: 'WA', identify: identifyWaLicenseFile, read: toWaLicenseRecords, key: () => 'WA',
    needs: "License Check needs Washington's Licensed Behavior Analyst credentials.",
  },
  {
    code: 'TX', identify: identifyTxLicenseFile, read: toTxLicenseRecords, key: () => 'TX',
    needs: "License Check needs Texas's Licensed Behavior Analyst licenses.",
  },
  {
    code: 'IL', identify: identifyIlLicenseFile, read: toIlLicenseRecords, key: () => 'IL',
    needs: "License Check needs Illinois's Licensed Behavioral Analyst licenses.",
  },
  {
    code: 'VT', identify: identifyVtLicenseFile, read: toVtLicenseRecords, key: () => 'VT',
    needs: "License Check needs Vermont's Applied and Assistant Behavior Analyst rosters.",
  },
  {
    code: 'PA', identify: identifyPaLicenseFile, read: toPaLicenseRecords, key: () => 'PA',
    needs: "License Check needs Pennsylvania's Behavior Specialist licenses.",
  },
  {
    code: 'OH', identify: identifyOhLicenseFile, read: toOhLicenseRecords, key: () => 'OH',
    needs: "License Check needs Ohio's Certified Ohio Behavior Analyst credentials.",
  },
  {
    code: 'CT', identify: identifyCtLicenseFile, read: toCtLicenseRecords, key: () => 'CT',
    needs: "License Check needs Connecticut's Behavior Analyst credentials.",
  },
];

/** "2026-09-20", in this person's own time zone. */
const localDate = (when) =>
  `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;

/**
 * Whatever a file is, once its bytes are in hand: identified, then filed.
 *
 * @param {string|null} madeOn  When it was made, if the file's name does not say.
 */
async function stageBuffer(name, buffer, sizeBytes, madeOn = null) {
  let staged = 0;
  for (const table of await tablesIn(name, buffer)) {
    // Arizona's export needs its header put right before it can even be read; anything else is untouched.
    const { headers, rows } = parseCsv(tidyAzText(table.text));

    const reader = READERS.find((candidate) => candidate.identify(headers));
    if (reader) {
      // Whatever else the file holds -- other professions, other credentials -- is left behind.
      const records = reader.read(rows);
      if (records.length === 0) throw new Error(`${name} has no behavior analysts in it. ${reader.needs}`);
      fileLicenses({
        key: reader.key(name), jurisdiction: reader.code, name, sizeBytes, records, ignored: rows.length - records.length,
        exportDate: reader.dated?.(name, table) ?? madeOn,
      });
      staged += 1;
      continue;
    }

    // The metadata CSV beside the data in the state's ZIP: expected, and not for us.
    if (headers.length > 0 && headers[0] === 'Column Name') continue;

    const { fileType, problem } = identifyFile(headers, rows);
    if (fileType?.id === 'staff' && !problem) {
      const { resolve } = createColumnResolver(headers);
      const keep = ['Id', 'FirstName', 'LastName', 'ChosenName', 'Credentials', 'IsActive'].map(resolve).filter(Boolean);
      const slim = rows.map((row) => Object.fromEntries(keep.map((header) => [header, row[header]])));
      contacts = { name, sizeBytes, loadedAt: Date.now(), staff: toStaffRecords({ headers: keep, rows: slim }) };
      staged += 1;
      continue;
    }
    if (problem) throw new Error(problem);
    if (fileType) throw new Error(`${name} is a ${fileType.titleLower} download. License Check needs the {staff} download.`);
    throw new Error(
      `${name} doesn't look like a {staff} download from CentralReach or a license download from ${listStates()}.`,
    );
  }

  if (staged === 0) throw new Error(`${name} has nothing License Check can use.`);
}

/**
 * A list that was put together from many requests rather than downloaded whole:
 * written as a CSV of just the columns License Check reads, then filed the same
 * as a CSV that was dropped in, so it can be checked the same way.
 */
async function stageSweep(prefix, headers, rows) {
  const made = localDate(new Date());
  const csv = toCsv(headers, rows.map((row) => headers.map((header) => row[header])));
  await stageBuffer(`${prefix}-${made}.csv`, Buffer.from(csv, 'utf8'), csv.length, made);
}

const FETCH_TIMEOUT_MS = 30_000;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * One request to a fixed address of a state's, and nothing else: no cookies, no
 * credentials, and never any staff data. A redirect is refused -- these
 * addresses do not redirect, and following one would mean fetching from
 * somewhere we did not choose -- and so is anything bigger than we would ever
 * expect.
 *
 * @param {string} url
 * @param {{ maxBytes: number, form?: Record<string,string> }} options  `form` makes it
 *   a POST of exactly those fields -- what a state's own page sends when its
 *   Download button is pressed.
 */
async function askState(url, { maxBytes, form }) {
  let response;
  try {
    response = await fetch(url, {
      method: form ? 'POST' : 'GET',
      body: form ? new URLSearchParams(form) : undefined,
      redirect: 'manual',
      credentials: 'omit',
      headers: { 'User-Agent': 'SystemReview (license list download)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Couldn't reach the state's site: ${error?.cause?.code ?? error?.message ?? error}`);
  }
  if (!response.ok) throw new Error(`The state's site answered ${response.status}.`);
  if (Number(response.headers.get('content-length')) > maxBytes) throw new Error("The state's file is far larger than expected, so it was not downloaded.");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error("The state's file is far larger than expected, so it was not downloaded.");
  return { buffer, headers: response.headers };
}

const FALLBACK = "You can download the files from the state's site yourself and drop them in instead.";
// These are about the state's site as a whole, not one file, so they carry no file name.
const siteProblem = (reason) => ({ files: describeLicenseFiles(), failed: [{ name: '', reason: `${reason} ${FALLBACK}` }] });

/**
 * Massachusetts: the state's list of what it publishes says which download has
 * which number, so the two behavior analyst files are found by name and follow
 * the state if it renumbers them.
 */
async function fetchMassachusetts() {
  let wanted;
  try {
    const listing = JSON.parse((await askState(MASS_EXPORT_LIST_URL, { maxBytes: 5_000_000 })).buffer.toString('utf8'));
    wanted = pickMassBehaviorAnalystExports(listing);
  } catch (error) {
    return siteProblem(error instanceof SyntaxError ? "The state's list of downloads wasn't in the form we expected." : error.message);
  }
  if (wanted.length === 0) return siteProblem("The state's list no longer shows the behavior analyst downloads.");

  const failed = [];
  for (const download of wanted) {
    try {
      const { buffer } = await askState(massExportUrl(download.id), { maxBytes: MAX_FILE_BYTES });
      if (!ZIP_MAGIC.every((byte, i) => buffer[i] === byte)) throw new Error("The state's site sent something that isn't a ZIP.");
      await stageBuffer(download.name, buffer, buffer.length);
    } catch (error) {
      failed.push({ name: download.name, reason: error?.message ?? String(error) });
    }
  }
  return { files: describeLicenseFiles(), failed };
}

/**
 * Rhode Island: the same request its Licensee Lists page makes when Download is
 * pressed. Naming the profession returns those few hundred people; leaving it
 * out returns the whole state -- tens of megabytes -- which is refused by the
 * size limit should the state ever start answering that way.
 */
async function fetchRhodeIsland() {
  try {
    const { buffer, headers } = await askState(RI_EXTRACT_URL, {
      maxBytes: 5_000_000,
      form: { prof: RI_PROFESSION, licType: '', output: '' },
    });
    // A web page (an error, a maintenance notice) in place of the list: say so, rather than
    // letting it fail later as "doesn't look like a download".
    if (!/License No/i.test(buffer.subarray(0, 600).toString('utf8'))) throw new Error("The state's site sent something that wasn't the list we asked for.");
    // The state names it with the day it was made; without that name we make one, so the age still shows.
    const named = headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
    const name = named ?? `${RI_PROFESSION.replace(/ /g, '-')}-licensee-extract-${new Date().toISOString().slice(0, 10)}.csv`;
    await stageBuffer(name, buffer, buffer.length, localDate(new Date()));
    return { files: describeLicenseFiles(), failed: [] };
  } catch (error) {
    return siteProblem(error?.message ?? String(error));
  }
}

/**
 * New Jersey: no address returns the roster, so this does what pressing the
 * site's buttons in turn does -- search behavior analysts, ask to download the
 * list, continue past the page that says the charge is $0.00, choose delimited
 * text -- and reads what comes out.
 *
 * Each step checks that the page it landed on is the page it expected. If the
 * site has changed, that is the answer, not a guess at what to press next.
 */
async function fetchNewJersey() {
  const session = openFormSession('newjersey.mylicense.com', { maxBytes: 20_000_000 });
  const step = async (page, changes, expects, what) => {
    const next = await session.submit(page, changes);
    if (!next.isPage || !expects.test(next.html)) throw new Error(`New Jersey's site didn't respond the way it used to (${what}).`);
    return next;
  };

  try {
    let page = await session.get(NJ_BULK_SEARCH_URL);
    if (!page.isPage || !/t_web_lookup__profession_name/.test(page.html)) throw new Error("New Jersey's site didn't respond the way it used to (its search form).");

    page = await step(page, { t_web_lookup__profession_name: NJ_PROFESSION, sch_button: 'Search' }, /btnBulkDownLoad/, 'its list of behavior analysts');
    page = await step(page, { btnBulkDownLoad: 'Download List' }, /btnContinue/, 'its confirmation page');
    page = await step(page, { btnContinue: 'Continue' }, /name="filetype"/, 'its file type page');

    const file = await session.submit(page, { sch_button: 'Download', filetype: 'delimitedtext' });
    if (file.isPage) throw new Error("New Jersey's site sent a web page where the list should be.");
    const name = file.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1] ?? 'Data.txt';
    await stageBuffer(name, file.buffer, file.buffer.length, localDate(new Date()));
    return { files: describeLicenseFiles(), failed: [] };
  } catch (error) {
    return siteProblem(error?.message ?? String(error));
  }
}

/**
 * The states that publish their licenses as an open dataset with a public query
 * API: one request, asking for the behavior analysts by name, returns a small
 * CSV. The addresses are built in core, where they can be tested.
 */
const OPEN_DATA = {
  WA: { name: 'Washington', url: waExtractUrl, header: /credentialnumber/i },
  TX: { name: 'Texas', url: txExtractUrl, header: /license_number/i },
  IL: { name: 'Illinois', url: ilExtractUrl, header: /license_number/i },
  CT: { name: 'Connecticut', url: ctExtractUrl, header: /credentialnumber/i },
};

/**
 * One request to a state's open-data API. The file is dated by when the state
 * last refreshed the dataset, not by today, so the report says how old the data
 * really is.
 */
const fetchOpenData = (code) => async () => {
  const { name, url, header } = OPEN_DATA[code];
  try {
    const { buffer, headers } = await askState(url(), { maxBytes: 20_000_000 });
    if (!header.test(buffer.subarray(0, 600).toString('utf8'))) throw new Error("The state's site sent something that wasn't the list we asked for.");
    const refreshed = headers.get('last-modified') ? new Date(headers.get('last-modified')) : new Date();
    const made = localDate(Number.isNaN(refreshed.getTime()) ? new Date() : refreshed);
    await stageBuffer(`${name}-behavior-analysts-${made}.csv`, buffer, buffer.length, made);
    return { files: describeLicenseFiles(), failed: [] };
  } catch (error) {
    return siteProblem(error?.message ?? String(error));
  }
};

/**
 * Pennsylvania's Behavior Specialists, from PALS's own search, a page at a time.
 * The list is assembled here and filed as a CSV like any other.
 */
async function fetchPennsylvania() {
  try {
    await stageSweep('Pennsylvania-behavior-specialists', PA_CSV_HEADERS, await sweepPennsylvania());
    return { files: describeLicenseFiles(), failed: [] };
  } catch (error) {
    return siteProblem(error?.message ?? String(error));
  }
}

/**
 * Vermont's Applied and Assistant Behavior Analysts, from the state's roster
 * download, one Excel file per license type; put together and filed as a CSV.
 */
async function fetchVermont() {
  try {
    await stageSweep('Vermont-behavior-analysts', VT_CSV_HEADERS, await sweepVermont());
    return { files: describeLicenseFiles(), failed: [] };
  } catch (error) {
    return siteProblem(error?.message ?? String(error));
  }
}

const FETCHERS = {
  MA: fetchMassachusetts,
  PA: fetchPennsylvania,
  VT: fetchVermont,
  RI: fetchRhodeIsland,
  NJ: fetchNewJersey,
  ...Object.fromEntries(Object.keys(OPEN_DATA).map((code) => [code, fetchOpenData(code)])),
};

/**
 * Ohio's list, from a search request copied out of the person's own browser
 * (core's ohio.js says why that is needed). The sweep is about two minutes of
 * searches; what comes back is filed as a CSV, the same as one dropped in.
 *
 * @param {string} copiedRequest
 */
export async function fetchOhioLicenseFiles(copiedRequest) {
  try {
    await stageSweep('Ohio-behavior-analysts', OH_CSV_HEADERS, await sweepOhio(String(copiedRequest ?? '')));
    return { files: describeLicenseFiles(), failed: [] };
  } catch (error) {
    return { files: describeLicenseFiles(), failed: [{ name: '', reason: error?.message ?? String(error) }] };
  }
}

/**
 * A state's current behavior analyst license list, fetched directly. Only when
 * asked for: this never runs by itself, and never polls. If anything about the
 * state's site has changed shape, the answer is a plain message and the manual
 * upload still works.
 *
 * @param {'MA'|'RI'} code
 */
export async function fetchLicenseFilesFromState(code) {
  const fetcher = FETCHERS[code];
  if (!fetcher) return siteProblem(`There is no way to fetch a list for "${code}".`);
  return fetcher();
}

/** What the Upload screen shows. No people. */
export function describeLicenseFiles() {
  return {
    contacts: contacts && { name: contacts.name, sizeBytes: contacts.sizeBytes, loadedAt: contacts.loadedAt, rowCount: contacts.staff.length },
    licenses: licenseFiles.map((file) => ({
      jurisdiction: file.jurisdiction,
      name: file.name,
      sizeBytes: file.sizeBytes,
      loadedAt: file.loadedAt,
      rowCount: file.records.length,
      ignored: file.ignored,
      exportDate: file.exportDate,
    })),
  };
}

export function removeLicenseFile(kind, name) {
  if (kind === 'contacts') contacts = null;
  else if (kind === 'licenses') {
    const index = licenseFiles.findIndex((file) => file.name === name);
    if (index >= 0) licenseFiles.splice(index, 1);
  }
  return describeLicenseFiles();
}

export function clearLicenseFiles() {
  contacts = null;
  licenseFiles.length = 0;
  return describeLicenseFiles();
}

const EMPTY = { people: [], checkedOn: null, dataDate: null, licenseCounts: {} };

/**
 * Everyone in the staff download, against every license loaded. Empty until
 * both are there -- one without the other has nothing to say.
 *
 * @param {string} today  ISO date, "2026-09-20", in the person's own time zone:
 *   a license that expires today is still good until the day is over.
 */
export function licenseCheckResults(today) {
  if (!contacts || licenseFiles.length === 0) return EMPTY;

  // The same row can arrive twice -- the Assistant download alongside the board's --
  // and counting it twice would make a person look like two. A row is the same
  // row only if all of this matches: New Jersey lists one license number twice,
  // once Expired and once Reinstatement Pending, and both say something.
  const unique = new Map();
  for (const file of licenseFiles) {
    for (const license of file.records) {
      const identity = [license.jurisdiction, license.number, license.status, license.firstName, license.lastName, license.expires].join('|');
      unique.set(identity, license);
    }
  }

  const licenseCounts = {};
  for (const license of unique.values()) licenseCounts[license.jurisdiction] = (licenseCounts[license.jurisdiction] ?? 0) + 1;

  // How old the oldest license file is: what the report has to be read against.
  const dates = licenseFiles.map((file) => file.exportDate).filter(Boolean).sort();

  return {
    people: matchLicenses(contacts.staff, [...unique.values()], today),
    checkedOn: today,
    dataDate: dates[0] ?? null,
    licenseCounts,
  };
}

export { exportCsv as exportLicenseCsv } from './csv-export.js';
