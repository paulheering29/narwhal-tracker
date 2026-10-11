import { readFileSync, writeFileSync } from 'node:fs';
import Papa from '/Users/paul/Desktop/System Review/node_modules/papaparse/papaparse.js';
import { clientsFileType } from '/Users/paul/Desktop/System Review/packages/core/src/files/types.js';
import { stageLicenseFiles, fetchLicenseFilesFromState, licenseCheckResults, describeLicenseFiles, clearLicenseFiles } from '/Users/paul/Desktop/System Review/packages/desktop/src/main/license-check.js';
const dir = process.argv[2];
const short = (r) => JSON.stringify({ files: r.files.licenses.map((f) => [f.jurisdiction, f.name.slice(0, 40), f.rowCount, f.ignored, f.exportDate]), failed: r.failed.map((f) => f.reason.slice(0, 110)) });
const tally = (people) => people.reduce((a, p) => ((a[p.outcome] = (a[p.outcome] ?? 0) + 1), a), {});

// Staff drawn from the WA data by status, so each has a known answer.
const wa = Papa.parse(readFileSync(`${dir}/../wa/aba.csv`, 'utf8'), { header: true, skipEmptyLines: true }).data;
const key = (r) => (r.firstname + '|' + r.lastname).trim().toLowerCase();
const cnt = new Map(); for (const r of wa) cnt.set(key(r), (cnt.get(key(r)) ?? 0) + 1);
const clean = (r) => cnt.get(key(r)) === 1 && /^[A-Za-z]+$/.test(r.firstname + r.lastname);
const pick = (status, type, n) => wa.filter((r) => r.status === status && r.credentialtype === type && clean(r)).slice(0, n);
const groups = [['Active LBA', pick('Active', 'Licensed Behavior Analyst', 25)], ['Expired LBA', pick('Expired', 'Licensed Behavior Analyst', 10)], ['Pending', pick('Pending', 'Licensed Behavior Analyst', 8)]];
// people who moved up: an assistant credential now Superseded, with a full license -- must read as ONE person
const movedUp = wa.filter((r) => r.status === 'Superseded').map((r) => wa.find((o) => key(o) === key(r) && o.status === 'Active' && o.credentialtype === 'Licensed Behavior Analyst')).filter(Boolean).slice(0, 10);
groups.push(['Moved up (LABA→LBA)', movedUp]);
const staff = [], order = [];
for (const [label, rows] of groups) for (const r of rows) { staff.push({ first: r.firstname.trim(), last: r.lastname.trim() }); order.push(label); }
for (let i = 0; i < 8; i++) { staff.push({ first: 'Zzyzx' + i, last: 'Qwertyuiop' + i }); order.push('nobody'); }
writeFileSync(`${dir}/staff-wa.csv`, [clientsFileType.signature.join(','), ...staff.map((s, i) => clientsFileType.signature.map((c) => JSON.stringify({ Id: String(3000 + i), TypeId: '572', Type: 'employee', FirstName: s.first, LastName: s.last, Credentials: 'BCBA', IsActive: 'True' }[c] ?? '')).join(','))].join('\n'));

console.log('== 1. live fetch from data.wa.gov');
let t = Date.now(); let r = await fetchLicenseFilesFromState('WA');
console.log(`${Date.now() - t} ms`, short(r));
await stageLicenseFiles([`${dir}/staff-wa.csv`]);
let rep = licenseCheckResults('2026-09-20');
console.log('licenseCounts', JSON.stringify(rep.licenseCounts), '| dataDate', rep.dataDate, '(dataset says 3,512 rows; 3,109 kept after superseded/closed/denied)');
const by = {}; rep.people.forEach((p, i) => { (by[order[i]] ??= {})[p.outcome] = (by[order[i]][p.outcome] ?? 0) + 1; });
for (const [k, v] of Object.entries(by)) console.log('  ', k.padEnd(22), JSON.stringify(v));

console.log('== 2. the whole-dataset shape: extra columns and other credentials are ignored (manual upload of a wider file)');
const wide = ['credentialnumber,lastname,firstname,middlename,credentialtype,status,birthyear,expirationdate', 'RN.1,Nurse,Nora,,Registered Nurse,Active,1980,01/01/2030', 'CBT.9,Tech,Tim,,Certified Behavior Technician,Active,1990,01/01/2030', 'LBA.BA.1,Vale,Pat,,Licensed Behavior Analyst,Active,1985,01/01/2030'].join('\n');
writeFileSync(`${dir}/wa-wide.csv`, wide); clearLicenseFiles();
r = await stageLicenseFiles([`${dir}/wa-wide.csv`]); console.log(short(r), '| birth year kept?', JSON.stringify(licenseCheckResults('2026-09-20')) .includes('1985'));

console.log('== 3. failures');
const real = globalThis.fetch;
const scen = { 'network down': async () => { const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; }, 'HTTP 429 (throttled)': async () => new Response('slow down', { status: 429 }), 'HTML instead of CSV': async () => new Response('<html>maintenance</html>', { status: 200 }), 'too large': async () => new Response('x', { headers: { 'content-length': '99000000' } }) };
for (const [n, impl] of Object.entries(scen)) { clearLicenseFiles(); globalThis.fetch = impl; const x = await fetchLicenseFilesFromState('WA'); console.log(`- ${n.padEnd(22)} → ${x.failed.map((f) => f.reason.slice(0, 95)).join(' | ')}`); }
globalThis.fetch = real; clearLicenseFiles();
