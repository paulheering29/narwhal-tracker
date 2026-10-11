import { readFileSync, writeFileSync } from 'node:fs';
import Papa from '/Users/paul/Desktop/System Review/node_modules/papaparse/papaparse.js';
import { clientsFileType } from '/Users/paul/Desktop/System Review/packages/core/src/files/types.js';
import { stageLicenseFiles, fetchOhioLicenseFiles, licenseCheckResults, describeLicenseFiles, clearLicenseFiles } from '/Users/paul/Desktop/System Review/packages/desktop/src/main/license-check.js';
const dir = '/private/tmp/claude-501/-Users-paul-Desktop-System-Review/f8a2a5ab-5d85-4291-a341-ba55fd5da45b/scratchpad/oh2';
const csvPath = process.env.HOME + '/Downloads/Ohio-behavior-analysts-2026-09-20.csv';
const rows = Papa.parse(readFileSync(csvPath, 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data;
const key = (r) => (r['First Name'] + '|' + r['Last Name']).toLowerCase();
const cnt = new Map(); for (const r of rows) cnt.set(key(r), (cnt.get(key(r)) ?? 0) + 1);
const clean = (r) => cnt.get(key(r)) === 1 && /^[A-Za-z]+$/.test(r['First Name'] + r['Last Name']);
const wanted = { Active: [], Submitted: [], 'Inactive/Expired': [], Closed: [] };
for (const r of rows.filter(clean)) { const k = r.Status === 'Inactive' ? 'Inactive/' + r['Sub Status'] : r.Status; if (wanted[k]?.length < 8) wanted[k].push(r); }
const people = [], order = [];
for (const [k, list] of Object.entries(wanted)) for (const r of list) { people.push(r); order.push(k); }
const staff = clientsFileType.signature;
writeFileSync(dir + '/staff-OH.csv', [staff.join(','), ...people.map((p, i) => staff.map((c) => JSON.stringify({ Id: String(1000 + i), TypeId: '572', Type: 'employee', FirstName: p['First Name'], LastName: p['Last Name'], Credentials: 'BCBA', IsActive: 'True' }[c] ?? '')).join(','))].join('\n'));
clearLicenseFiles();
const r = await stageLicenseFiles([dir + '/staff-OH.csv', csvPath]);
console.log('staged', JSON.stringify(describeLicenseFiles().licenses), r.failed);
const res = licenseCheckResults('2026-09-20');
const tally = {}; res.people.forEach((p, i) => { const k = order[i] + ' -> ' + p.outcome; tally[k] = (tally[k] ?? 0) + 1; });
console.log(res.people.length, 'people'); console.log(JSON.stringify(tally, null, 1));
console.log('== bad requests');
for (const bad of ['', 'curl https://example.com', JSON.stringify([{ action: 'OH_VerifyLicenseCtlr', method: 'findLicensesForOwner', ctx: { csrf: btoa('V1,' + btoa('2020-01-01T00:00:00.000Z') + ',x'), vid: 'v', ver: 45, authorization: 'j' } }])]) {
  const out = await fetchOhioLicenseFiles(bad); console.log(' ', out.failed.map((f) => f.reason.slice(0, 110)));
}
