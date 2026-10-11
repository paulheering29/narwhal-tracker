import { readFileSync, writeFileSync } from 'node:fs';
import Papa from '/Users/paul/Desktop/System Review/node_modules/papaparse/papaparse.js';
import { clientsFileType } from '/Users/paul/Desktop/System Review/packages/core/src/files/types.js';
import { splitCommaName, splitPlainName } from '/Users/paul/Desktop/System Review/packages/core/src/index.js';
import { stageLicenseFiles, fetchLicenseFilesFromState, licenseCheckResults, describeLicenseFiles, clearLicenseFiles } from '/Users/paul/Desktop/System Review/packages/desktop/src/main/license-check.js';

const dir = process.argv[2]; const S = `${dir}/../states`;
const read = (p) => Papa.parse(readFileSync(p, 'utf8'), { header: true, skipEmptyLines: true }).data;
const short = (r) => JSON.stringify({ files: r.files.licenses.map((f) => [f.jurisdiction, f.name.slice(0, 34), f.rowCount, f.ignored, f.exportDate]), failed: r.failed.map((f) => f.reason.slice(0, 100)) });
const writeStaff = (name, people) => writeFileSync(`${dir}/${name}`, [clientsFileType.signature.join(','), ...people.map((p, i) => clientsFileType.signature.map((c) => JSON.stringify({ Id: String(1000 + i), TypeId: '572', Type: 'employee', FirstName: p.first, LastName: p.last, Credentials: 'BCBA', IsActive: 'True' }[c] ?? '')).join(','))].join('\n'));
const cap = (t) => t.toLowerCase().replace(/(^|[\s-])(\w)/g, (m, a, b) => a + b.toUpperCase());

// One staff list per state: people picked by the status their record has, so each has a known answer.
const specs = {
  TX: { rows: read(`${S}/tx.csv`).map((r) => ({ ...splitCommaName(r.owner_name), s: new Date(r.license_expiration_date_mmddccyy) < new Date('2026-09-20') ? 'past' : 'future' })), by: 's', want: { future: 'current|expiring', past: 'expired' } },
  IL: { rows: read(`${S}/il.csv`).map((r) => ({ firstName: r.first_name, lastName: r.last_name, s: r.license_status })), by: 's', want: { ACTIVE: 'current|expiring', 'NOT RENEWED': 'expired', 'VOLUNTARY SURRENDER': 'review' } },
  CT: { rows: read(`${S}/ct.csv`).filter((r) => r.type === 'INDIVIDUAL' && r.status !== 'EXPIRED APPLICATION').map((r) => ({ ...splitPlainName(r.name), s: r.status === 'INACTIVE' && /LAPSED/.test(r.statusreason) ? 'LAPSED' : r.status })), by: 's', want: { ACTIVE: 'current|expiring', LAPSED: 'expired', PENDING: 'review' } },
};
for (const [code, spec] of Object.entries(specs)) {
  const key = (r) => (r.firstName + '|' + r.lastName).toLowerCase(); const cnt = new Map(); for (const r of spec.rows) cnt.set(key(r), (cnt.get(key(r)) ?? 0) + 1);
  const clean = (r) => cnt.get(key(r)) === 1 && /^[A-Za-z]+$/.test(r.firstName + r.lastName);
  const people = [], order = [];
  for (const status of Object.keys(spec.want)) for (const r of spec.rows.filter((x) => x[spec.by] === status && clean(x)).slice(0, 12)) { people.push({ first: cap(r.firstName), last: cap(r.lastName) }); order.push(status); }
  for (let i = 0; i < 5; i++) { people.push({ first: 'Zzyzx' + i, last: 'Qwertyuiop' + i }); order.push('nobody'); }
  writeStaff(`staff-${code}.csv`, people);

  console.log(`== ${code}: live fetch`);
  clearLicenseFiles();
  let t = Date.now(); const r = await fetchLicenseFilesFromState(code);
  console.log(`  ${Date.now() - t} ms`, short(r));
  await stageLicenseFiles([`${dir}/staff-${code}.csv`]);
  const rep = licenseCheckResults('2026-09-20');
  console.log('  licenseCounts', JSON.stringify(rep.licenseCounts), '| dataDate', rep.dataDate);
  const by = {}; rep.people.forEach((p, i) => { (by[order[i]] ??= {})[p.outcome] = (by[order[i]][p.outcome] ?? 0) + 1; });
  for (const [k, v] of Object.entries(by)) console.log('   ', k.padEnd(22), JSON.stringify(v), k === 'nobody' ? '(expect none)' : `(expect ${spec.want[k]})`);
}

console.log('== all seven fetchable states together');
clearLicenseFiles(); for (const code of ['MA', 'RI', 'NJ', 'WA', 'TX', 'IL', 'CT']) await fetchLicenseFilesFromState(code);
console.log('  files:', describeLicenseFiles().licenses.map((f) => f.jurisdiction).join(','));
