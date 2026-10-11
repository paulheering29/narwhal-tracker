import { stageLicenseFiles, fetchLicenseFilesFromState, licenseCheckResults, describeLicenseFiles, clearLicenseFiles } from '/Users/paul/Desktop/System Review/packages/desktop/src/main/license-check.js';
const dir = process.argv[2];
const short = (r) => JSON.stringify({ files: r.files.licenses.map((f) => [f.name.slice(0, 32), f.rowCount, f.exportDate, f.sizeBytes]), failed: r.failed });

console.log('== 1. live, against the real state site');
let t = Date.now();
let r = await fetchLicenseFilesFromState();
console.log(`${Date.now() - t} ms`, short(r));
await stageLicenseFiles([`${dir}/staff.csv`]);
const rep = licenseCheckResults('2026-09-20');
const c = {}; for (const p of rep.people) c[p.outcome] = (c[p.outcome] ?? 0) + 1;
console.log('report from fetched files:', JSON.stringify(c), 'licenses', rep.licenseCount, 'dataDate', rep.dataDate);

console.log('== 2. pressing it again replaces, not doubles');
r = await fetchLicenseFilesFromState();
console.log('license files now:', r.files.licenses.length, 'licenses counted:', licenseCheckResults('2026-09-20').licenseCount);

console.log('== 3. an older manual upload is replaced by a newer fetch');
clearLicenseFiles();
await stageLicenseFiles([`${dir}/Licensed_Applied_Behavior_Analyst_License_Export_2026-09-20T06_14_28.872Z.zip`]);
console.log('after manual:', describeLicenseFiles().licenses.length);
r = await fetchLicenseFilesFromState();
console.log('after fetch :', r.files.licenses.length, '(LABA replaced, LAABA added)');

// stubbed failures
const realFetch = globalThis.fetch;
const listing = JSON.stringify([{ name: 'Licensed_Applied_Behavior_Analyst_License_Export_2026-09-20T06_14_28.872Z.zip', licenseMetaId: 30, visible: true, sizeInBytes: 1 }]);
const scenarios = {
  'network down': async () => { const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; },
  'HTTP 503': async () => new Response('no', { status: 503 }),
  'list is HTML': async () => new Response('<html>maintenance</html>', { status: 200 }),
  'list has no ABA': async () => new Response('[]', { status: 200 }),
  'redirect': async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } }),
  'download is not a zip': async (url) => (String(url).endsWith('/export/all') ? new Response(listing) : new Response('<html>oops</html>')),
  'download too large': async (url) => (String(url).endsWith('/export/all') ? new Response(listing) : new Response('x', { headers: { 'content-length': String(500 * 1024 * 1024) } })),
};
console.log('== 4. failures, each with a stubbed network');
for (const [name, impl] of Object.entries(scenarios)) {
  clearLicenseFiles(); globalThis.fetch = impl;
  const res = await fetchLicenseFilesFromState();
  console.log(`- ${name.padEnd(22)} → files ${res.files.licenses.length}, message: ${res.failed.map((f) => f.reason).join(' | ')}`);
}
globalThis.fetch = realFetch;
