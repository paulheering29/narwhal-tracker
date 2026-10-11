import { readFileSync, writeFileSync } from 'node:fs';
import Papa from '/Users/paul/Desktop/System Review/node_modules/papaparse/papaparse.js';
import { clientsFileType } from '/Users/paul/Desktop/System Review/packages/core/src/files/types.js';
import { stageLicenseFiles, fetchLicenseFilesFromState, licenseCheckResults, describeLicenseFiles, clearLicenseFiles } from '/Users/paul/Desktop/System Review/packages/desktop/src/main/license-check.js';

const dir = process.argv[2];
const riFile = '/Users/paul/Downloads/-licensee-extract-2026-09-20.csv';
const short = (r) => JSON.stringify({ files: r.files.licenses.map((f) => [f.jurisdiction, f.name.slice(0, 30), f.rowCount, f.ignored, f.exportDate]), failed: r.failed.map((f) => f.reason.slice(0, 90)) });
const mb = () => Math.round(process.memoryUsage().rss / 1048576);

// A staff list built from real names in both states' lists, plus known variants.
const read = (p) => Papa.parse(readFileSync(p, 'utf8'), { header: true, skipEmptyLines: true }).data;
const ri = read(riFile).filter((r) => r.Profession === 'Applied Behavior Analyst');
const ma = read(`${dir}/Licensed_Applied_Behavior_Analyst_License_Data_Export_2026-09-20T06_14_28.872Z.csv`).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.trim()])));
const maCount = new Map(); for (const r of ma) { const k = (r['First Name'] + '|' + r['Last Name']).toLowerCase(); maCount.set(k, (maCount.get(k) ?? 0) + 1); }
const maUnique = ma.filter((r) => maCount.get((r['First Name'] + '|' + r['Last Name']).toLowerCase()) === 1 && r['License Status'] === 'Current' && /^[A-Za-z]+$/.test(r['First Name'] + r['Last Name']));
const cap = (t) => t[0] + t.slice(1).toLowerCase();
const staff = [];
for (const r of ri.slice(0, 40)) staff.push({ first: cap(r.First), last: cap(r.Last) });               // 40 RI people, mixed case vs the file's ALL CAPS
for (const r of maUnique.slice(0, 40)) staff.push({ first: r['First Name'], last: r['Last Name'] });     // 40 MA people
for (let i = 0; i < 15; i++) staff.push({ first: 'Zzyzx' + i, last: 'Qwertyuiop' + i });                 // 15 nobody
writeFileSync(`${dir}/staff-ri.csv`, [
  clientsFileType.signature.join(','),
  ...staff.map((s, i) => clientsFileType.signature.map((c) => JSON.stringify({ Id: String(7000 + i), TypeId: '572', Type: 'employee', FirstName: s.first, LastName: s.last, Credentials: 'BCBA', IsActive: 'True' }[c] ?? '')).join(',')),
].join('\n'));
const tally = (people) => people.reduce((a, p) => ((a[p.outcome] = (a[p.outcome] ?? 0) + 1), a), {});

console.log('== 1. your 33 MB whole-state file, uploaded by hand');
let t = Date.now(); const before = mb();
let r = await stageLicenseFiles([riFile]);
console.log(`${Date.now() - t} ms · rss ${before}→${mb()} MB`, short(r));

console.log('== 2. the live fetch replaces it (same list, same state)');
t = Date.now(); r = await fetchLicenseFilesFromState('RI');
console.log(`${Date.now() - t} ms`, short(r));

console.log('== 3. Massachusetts alongside it');
t = Date.now(); r = await fetchLicenseFilesFromState('MA');
console.log(`${Date.now() - t} ms`, short(r));
await stageLicenseFiles([`${dir}/staff-ri.csv`]);
let rep = licenseCheckResults('2026-09-20');
console.log('licenseCounts', JSON.stringify(rep.licenseCounts), '| dataDate', rep.dataDate);
console.log('outcomes (both states)', JSON.stringify(tally(rep.people)), '| expected: 80 current, 15 none');
const byState = (a, b) => rep.people.slice(a, b).map((p) => [...new Set(p.matches.map((m) => m.jurisdiction))].join('+') || '-');
console.log('first 40 (RI people) matched in:', JSON.stringify(byState(0, 40).reduce((c, x) => ((c[x] = (c[x] ?? 0) + 1), c), {})));
console.log('next 40 (MA people) matched in:', JSON.stringify(byState(40, 80).reduce((c, x) => ((c[x] = (c[x] ?? 0) + 1), c), {})));

console.log('== 4. Rhode Island only');
clearLicenseFiles(); await stageLicenseFiles([`${dir}/staff-ri.csv`]); await fetchLicenseFilesFromState('RI');
rep = licenseCheckResults('2026-09-20'); console.log('outcomes (RI only)', JSON.stringify(tally(rep.people)), '| expected 40 current, 55 none');

console.log('== 5. failures, with a stubbed network');
const real = globalThis.fetch; const csvHead = 'Name,First,Middle,Last,Owner Manager Name,License No,Profession,License Type,Status,Issue Date,Specialty,Expiration Date\n';
const scenarios = {
  'network down': async () => { const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; },
  'HTTP 500': async () => new Response('no', { status: 500 }),
  'HTML instead of CSV': async () => new Response('<html>maintenance</html>', { status: 200 }),
  'whole state (too large)': async () => new Response('x', { headers: { 'content-length': String(33_000_000) } }),
  'no behavior analysts': async () => new Response(csvHead + ',A,,B,,X1,Food Service,Seats,Active,01/01/2020,,01/01/2030\n', { status: 200 }),
  'redirect': async () => new Response(null, { status: 302 }),
};
for (const [name, impl] of Object.entries(scenarios)) { clearLicenseFiles(); globalThis.fetch = impl; const x = await fetchLicenseFilesFromState('RI'); console.log(`- ${name.padEnd(24)} → files ${x.files.licenses.length}: ${x.failed.map((f) => f.reason.slice(0, 120)).join(' | ')}`); }
globalThis.fetch = real; clearLicenseFiles();
console.log('unknown state:', (await fetchLicenseFilesFromState('ZZ')).failed[0].reason);
