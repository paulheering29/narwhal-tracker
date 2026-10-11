import { readFileSync, writeFileSync } from 'node:fs';
import Papa from '/Users/paul/Desktop/System Review/node_modules/papaparse/papaparse.js';
import { clientsFileType } from '/Users/paul/Desktop/System Review/packages/core/src/files/types.js';
import { stageLicenseFiles, fetchLicenseFilesFromState, licenseCheckResults, describeLicenseFiles, clearLicenseFiles } from '/Users/paul/Desktop/System Review/packages/desktop/src/main/license-check.js';

const dir = process.argv[2];
const njFile = '/Users/paul/Downloads/Data.txt';
const short = (r) => JSON.stringify({ files: r.files.licenses.map((f) => [f.jurisdiction, f.name.slice(0, 26), f.rowCount, f.ignored, f.exportDate]), failed: r.failed.map((f) => f.reason.slice(0, 100)) });
const tally = (people) => people.reduce((a, p) => ((a[p.outcome] = (a[p.outcome] ?? 0) + 1), a), {});

// Staff drawn from the NJ file by status, so we know what each should come back as.
const nj = Papa.parse(readFileSync(njFile, 'utf8'), { header: true, skipEmptyLines: true, delimiter: '|' }).data;
const key = (r) => (r.first_name + '|' + r.last_name).trim().toLowerCase();
const count = new Map(); for (const r of nj) count.set(key(r), (count.get(key(r)) ?? 0) + 1);
const clean = (r) => count.get(key(r)) === 1 && /^[A-Za-z]+$/.test(r.first_name + r.last_name);
const pickBy = (status, n) => nj.filter((r) => r.license_status_name === status && clean(r)).slice(0, n);
const groups = { Active: pickBy('Active', 30), Pending: pickBy('Pending', 10), Expired: pickBy('Expired', 10), Inactive: pickBy('Inactive', 5) };
const staff = []; const order = [];
for (const [status, rows] of Object.entries(groups)) for (const r of rows) { staff.push({ first: r.first_name.trim(), last: r.last_name.trim() }); order.push(status); }
for (let i = 0; i < 10; i++) { staff.push({ first: 'Zzyzx' + i, last: 'Qwertyuiop' + i }); order.push('nobody'); }
writeFileSync(`${dir}/staff-nj.csv`, [
  clientsFileType.signature.join(','),
  ...staff.map((s, i) => clientsFileType.signature.map((c) => JSON.stringify({ Id: String(5000 + i), TypeId: '572', Type: 'employee', FirstName: s.first, LastName: s.last, Credentials: 'BCBA', IsActive: 'True' }[c] ?? '')).join(',')),
].join('\n'));

console.log('== 1. your Data.txt, uploaded by hand');
let r = await stageLicenseFiles([njFile, `${dir}/staff-nj.csv`]);
console.log(short(r));
let rep = licenseCheckResults('2026-09-20');
console.log('licenseCounts', JSON.stringify(rep.licenseCounts), '(5,109 rows - 6 withdrawn/deleted = 5,103)');
const by = {}; rep.people.forEach((p, i) => { (by[order[i]] ??= {})[p.outcome] = (by[order[i]][p.outcome] ?? 0) + 1; });
console.log('outcome by status of the person\'s NJ record:'); for (const [k, v] of Object.entries(by)) console.log('  ', k.padEnd(9), JSON.stringify(v));

console.log('== 2. the live one-click fetch (6 requests) replaces it');
let t = Date.now(); r = await fetchLicenseFilesFromState('NJ');
console.log(`${Date.now() - t} ms`, short(r));
rep = licenseCheckResults('2026-09-20');
console.log('same outcomes as the hand-downloaded file:', JSON.stringify(tally(rep.people)), '| license counts', JSON.stringify(rep.licenseCounts));

console.log('== 3. all three states together (MA, RI, NJ), each fetched live');
for (const code of ['MA', 'RI']) await fetchLicenseFilesFromState(code);
rep = licenseCheckResults('2026-09-20');
console.log('licenseCounts', JSON.stringify(rep.licenseCounts), '| files:', describeLicenseFiles().licenses.map((f) => f.jurisdiction).join(','));

console.log('== 4. failures in the NJ chain (stubbed network)');
const real = globalThis.fetch;
const page = (body, extra = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html', ...extra } });
const scenarios = {
  'network down': async () => { const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; },
  'HTTP 500': async () => new Response('x', { status: 500 }),
  'site redesigned (no form)': async () => page('<html>new site</html>'),
  'search step changed': async (u, o) => (o?.method === 'POST' ? page('<html>oops</html>') : page('<input name="t_web_lookup__profession_name" value="">')),
  'redirect to another host': async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } }),
};
for (const [name, impl] of Object.entries(scenarios)) { clearLicenseFiles(); globalThis.fetch = impl; const x = await fetchLicenseFilesFromState('NJ'); console.log(`- ${name.padEnd(26)} → files ${x.files.licenses.length}: ${x.failed.map((f) => f.reason.slice(0, 115)).join(' | ')}`); }
globalThis.fetch = real; clearLicenseFiles();
