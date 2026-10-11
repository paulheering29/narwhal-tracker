import { readFileSync, writeFileSync } from 'node:fs';
import Papa from '/Users/paul/Desktop/System Review/node_modules/papaparse/papaparse.js'; const parse = Papa.parse.bind(Papa);
import { clientsFileType } from '/Users/paul/Desktop/System Review/packages/core/src/files/types.js';
import { stageLicenseFiles, licenseCheckResults, describeLicenseFiles, removeLicenseFile } from '/Users/paul/Desktop/System Review/packages/desktop/src/main/license-check.js';

const dir = process.argv[2];
const data = readFileSync(`${dir}/Licensed_Applied_Behavior_Analyst_License_Data_Export_2026-09-20T06_14_28.872Z.csv`, 'utf8');
const lic = parse(data, { header: true, skipEmptyLines: true }).data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.trim()])));

// deterministic pseudo-random
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const nameCount = new Map(); for (const r of lic) { const k = (r['First Name'] + '|' + r['Last Name']).toLowerCase(); nameCount.set(k, (nameCount.get(k) ?? 0) + 1); }
const unique = lic.filter((r) => nameCount.get((r['First Name'] + '|' + r['Last Name']).toLowerCase()) === 1 && /^[A-Za-z]+$/.test(r['First Name']) && /^[A-Za-z]+$/.test(r['Last Name']));
const current = unique.filter((r) => r['License Status'] === 'Current' && r['Expiration Date'] > '12/31/2026' || r['License Status'] === 'Current' && r['Expiration Date'].endsWith('2027'));
const expired = unique.filter((r) => r['License Status'] === 'Expired');
const dupes = lic.filter((r) => nameCount.get((r['First Name'] + '|' + r['Last Name']).toLowerCase()) > 1);

const staff = []; const expect = {};
const add = (first, last, want, chosen = '') => { staff.push({ first, last, chosen }); expect[want] = (expect[want] ?? 0) + 1; };
for (let i = 0; i < 50; i++) { const r = pick(current); add(r['First Name'], r['Last Name'], 'current|expiring'); }
for (let i = 0; i < 10; i++) { const r = pick(expired); add(r['First Name'], r['Last Name'], 'expired'); }
for (let i = 0; i < 10; i++) { const r = pick(current); add(r['First Name'].toUpperCase(), r['Last Name'].toLowerCase(), 'current|expiring'); }   // case
for (let i = 0; i < 10; i++) { const r = pick(current); add('  ' + r['First Name'] + ' ', r['Last Name'], 'current|expiring'); }                 // spaces
const seen = new Set(); for (const r of dupes) { const k = (r['First Name'] + '|' + r['Last Name']).toLowerCase(); if (!seen.has(k) && seen.size < 15) { seen.add(k); add(r['First Name'], r['Last Name'], 'multiple'); } }
for (let i = 0; i < 20; i++) add('Zzyzx' + i, 'Qwertyuiop' + i, 'none');
writeFileSync(`${dir}/staff.csv`, [
  clientsFileType.signature.join(','),
  ...staff.map((s, i) => clientsFileType.signature.map((c) => JSON.stringify({ Id: String(9000 + i), TypeId: '572', Type: 'employee', FirstName: s.first, LastName: s.last, ChosenName: s.chosen, Credentials: 'BCBA', IsActive: 'True', Email: '', BirthDate: '1/1/1990' }[c] ?? '')).join(',')),
].join('\n'));

let t = Date.now();
const staged = await stageLicenseFiles([
  `${dir}/Licensed_Applied_Behavior_Analyst_License_Export_2026-09-20T06_14_28.872Z.zip`,
  `${dir}/Licensed_Assistant_Applied_Behavior_Analyst_License_Export_2026-09-20T06_14_29.323Z.zip`,
  `${dir}/staff.csv`,
  `${dir}/Licensed_Applied_Behavior_Analyst_License_Metadata_Export_2026-09-20T06_14_28.872Z.csv`, // metadata alone: should be refused
  `${dir}/nope.txt`,
]);
console.log('staged', Date.now() - t, 'ms');
console.log(JSON.stringify(staged.files, null, 0));
console.log('failed:', JSON.stringify(staged.failed));
t = Date.now();
const report = licenseCheckResults('2026-09-20');
console.log('matched', Date.now() - t, 'ms; people', report.people.length, 'licenses', report.licenseCount, 'dataDate', report.dataDate);
const counts = {}; for (const p of report.people) counts[p.outcome] = (counts[p.outcome] ?? 0) + 1;
console.log('outcomes', JSON.stringify(counts));
console.log('expected  ', JSON.stringify(expect));
// per-group check: the first 50 people should each be current/expiring, etc.
const seg = (from, to) => report.people.slice(from, to).reduce((a, p) => ((a[p.outcome] = (a[p.outcome] ?? 0) + 1), a), {});
console.log('exact current group   ', JSON.stringify(seg(0, 50)));
console.log('expired group         ', JSON.stringify(seg(50, 60)));
console.log('UPPER/lower group     ', JSON.stringify(seg(60, 70)));
console.log('stray-space group     ', JSON.stringify(seg(70, 80)));
console.log('shared-name group     ', JSON.stringify(seg(80, 80 + seen.size)));
console.log('made-up-name group    ', JSON.stringify(seg(80 + seen.size, 80 + seen.size + 20)));
removeLicenseFile('licenses', 'Licensed_Assistant_Applied_Behavior_Analyst_License_Export_2026-09-20T06_14_29.323Z.zip');
console.log('after removing one:', describeLicenseFiles().licenses.length, 'license file left, contacts kept:', !!describeLicenseFiles().contacts);
