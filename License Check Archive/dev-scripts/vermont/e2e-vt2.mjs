import { readFileSync, writeFileSync } from 'node:fs';
import Papa from '/Users/paul/Desktop/System Review/node_modules/papaparse/papaparse.js';
import { clientsFileType } from '/Users/paul/Desktop/System Review/packages/core/src/files/types.js';
import { fetchLicenseFilesFromState, stageLicenseFiles, licenseCheckResults, describeLicenseFiles, clearLicenseFiles } from '/Users/paul/Desktop/System Review/packages/desktop/src/main/license-check.js';
const dir = '/private/tmp/claude-501/-Users-paul-Desktop-System-Review/f8a2a5ab-5d85-4291-a341-ba55fd5da45b/scratchpad/vt';
const rows = Papa.parse(readFileSync(dir + '/Vermont.csv', 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data;
const key = (r) => (r['First Name'].split(' ')[0] + '|' + r['Last Name']).toLowerCase();
const cnt = new Map(); for (const r of rows) cnt.set(key(r), (cnt.get(key(r)) ?? 0) + 1);
const clean = (r) => cnt.get(key(r)) === 1 && /^[A-Za-z]+$/.test(r['First Name'] + r['Last Name']);
const cap = (t) => t.toLowerCase().replace(/^./, (c) => c.toUpperCase());
const wanted = { Active: [], Expired: [], Surrendered: [], 'Renewal Extension': [] };
for (const r of rows.filter(clean)) if (wanted[r.Status]?.length < 6) wanted[r.Status].push(r);
const people = [], order = [];
for (const [k, list] of Object.entries(wanted)) for (const r of list) { people.push(r); order.push(k); }
for (let i = 0; i < 3; i++) { people.push({ 'First Name': 'Zzyzx' + i, 'Last Name': 'Qwertyuiop' + i }); order.push('nobody'); }
const sig = clientsFileType.signature;
writeFileSync(dir + '/staff-VT.csv', [sig.join(','), ...people.map((p, i) => sig.map((c) => JSON.stringify({ Id: String(1000 + i), TypeId: '572', Type: 'employee', FirstName: cap(p['First Name']), LastName: cap(p['Last Name']), Credentials: 'BCBA', IsActive: 'True' }[c] ?? '')).join(','))].join('\n'));
clearLicenseFiles();
const t0 = Date.now();
const r = await fetchLicenseFilesFromState('VT');
console.log('fetched in', ((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(describeLicenseFiles().licenses.map((f) => [f.jurisdiction, f.name, f.rowCount, f.ignored, f.exportDate])), r.failed);
await stageLicenseFiles([dir + '/staff-VT.csv']);
const res = licenseCheckResults('2026-09-20');
const tally = {}; res.people.forEach((p, i) => { const k = order[i] + ' -> ' + p.outcome; tally[k] = (tally[k] ?? 0) + 1; });
console.log(res.people.length, 'people', JSON.stringify(tally, null, 1));
