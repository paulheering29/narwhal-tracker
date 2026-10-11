import { describe, it, expect } from 'vitest';
import {
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
  identifyVtLicenseFile,
  identifyPaLicenseFile,
  identifyOhLicenseFile,
  toVtLicenseRecords,
  matchLicenses,
  VT_CSV_HEADERS,
  VT_LICENSE_TYPES,
  JURISDICTIONS,
} from '../src/index.js';

// A page in the shape the site sends it: JSON with its quotes, equals signs and ampersands escaped, holding each action's token.
// (<eq>, <sq> and <amp> stand for the escapes =, ' and &, written out below so they survive being read as JavaScript.)
const escapes = (text) => text.replaceAll('<eq>', '\\u003d').replaceAll('<sq>', '\\u0027').replaceAll('<amp>', '\\u0026');
const action = (kind, body) => escapes(String.raw` "rule_1":" data-${kind}<eq><sq>${body}<sq> ",`);
const page = escapes(
  [
    '"activeCSRFToken": "0123abcd"',
    `pzTransactionId=${'a'.repeat(32)}`,
    `"pzHarnessID": "HID${'B'.repeat(32)}"`,
    '{"section":"FindAProfessionalWrapper","class":"SoV-License-NGLP-Work-License","RO":"true","UID":"SID111"}',
    '{"section":"FindAProfessionalInput","class":"SoV-License-NGLP-Work-License","UID":"SID222"}',
    '"section":"NGLPLicenseLookupInput","secPostValueURL":"pzuiactionzzz<eq>PROF%3D*"',
    '"section":"NGLPRosterDownloadStatusSelect","secPostValueURL":"pzuiactionzzz<eq>STAT%3D*"',
    '"section":"NGLPRosterDownload","secPostValueURL":"pzuiactionzzz<eq>TYPE%3D*"',
  ].join('\n'),
) +
  '\n' +
  [
    action('click', String.raw`[[\"refresh\", [\"otherSection\",\"FindAProfessionalWrapper\", \"\", \"<eq>\", \"\", \"UpdateLookupType,\",\":event\",\"\",[\"pzuiactionzzz<eq>TAB%3D*\",{},{\"LookupType\":\"Roster+Download\"}],\"pyDisplayHarness\"]]]`),
    action('change', String.raw`[[\"postValue\",[\":event\"]],[\"refresh\", [\"otherSection\",\"FindAProfessionalInput\", \"\", \"<eq>\", \"\", \"SetRosterDownloadStatuses,\",\":event\",\"\",[\"pzuiactionzzz<eq>STATUSES%3D*\",{},{}],\"pyDisplayHarness\"]]]`),
    action('click', String.raw`[[\"refresh\", [\"otherSection\",\"NGLPRosterDownloadResults\", \"SetRosterDownloadApplicant\", \"<eq>\", \"\", \",\",\":event\",\"\",[\"pzuiactionzzz<eq>DOWNLOAD%3D*\",{},{}],\"pyDisplayHarness\"]],[\"openUrlInWindow\", [\"/prweb/App/x*/!STANDARD?pyActivity<eq>@baseclass.pzProcessURLInWindow<amp>amp;pyPreActivity<eq>NGLPGenerateRosterDownload<amp>amp;pzPrimaryPageName<eq>pyDisplayHarness\", \"\", \"height<eq>200\"]]]`),
  ].join('\n');
const START_URL = 'https://site.example/prweb/App/x*/!STANDARD?UserIdentifier=guest';

describe("Vermont's roster page", () => {
  const session = readVtStart(page, START_URL);

  it('gives the session it started', () => {
    expect(session).toMatchObject({ csrf: '0123abcd', transactionId: 'a'.repeat(32), harnessId: `HID${'B'.repeat(32)}`, base: 'https://site.example/prweb/App/x*/!STANDARD' });
    expect(session.sections).toEqual({ FindAProfessionalWrapper: 'SID111', FindAProfessionalInput: 'SID222' });
  });

  it('is not a session when the page is something else', () => {
    expect(readVtStart('<html>Status Page</html>', START_URL)).toBeNull();
  });

  it('finds each action by what it does', () => {
    expect(readVtActions(page)).toEqual({
      tab: 'TAB%3D*',
      statuses: 'STATUSES%3D*',
      download: 'DOWNLOAD%3D*',
      spreadsheetPath: '/prweb/App/x*/!STANDARD?pyActivity=%40baseclass.pzProcessURLInWindow&pyPreActivity=NGLPGenerateRosterDownload&pzPrimaryPageName=pyDisplayHarness',
    });
  });

  it('finds the token for each kind of choice by the section it is made in', () => {
    expect(readVtValueTokens(page)).toEqual({ profession: 'PROF%3D*', status: 'STAT%3D*', type: 'TYPE%3D*' });
  });
});

describe('the requests', () => {
  const session = { ...readVtStart(page, START_URL), actions: readVtActions(page) };
  const tokens = readVtValueTokens(page);

  it('press the roster button with its own token, naming the section it refreshes', () => {
    const { url, body } = vtTabRequest(session);
    expect(url).toContain(`pzTransactionId=${'a'.repeat(32)}`);
    expect(body).toContain('pzuiactionzzz=TAB%3D*');
    expect(body).toContain('FindAProfessionalWrapper%7CRule-HTML-Section%7C%7C%7C%7CY%7CSID111');
    expect(body).toContain(`pzHarnessID=HID${'B'.repeat(32)}`);
  });

  it('choose a value, sending the token with the "=" the page writes after it', () => {
    const { body } = vtChoiceRequest(session, { property: 'ProductIds', value: 'PC038', token: tokens.profession });
    expect(body.startsWith('$PpyDisplayHarness$pProductIds=PC038&')).toBe(true);
    expect(body).toContain('pzuiactionzzz=PROF%3D*=&');
    expect(body).toContain('pyPropertyTarget=%24PpyDisplayHarness%24pProductIds');
  });

  it('tick the nth status, then refresh with the ticks so far', () => {
    expect(vtTickRequest(session, tokens, 3).body).toContain('$PpyDisplayHarness$pEligibleStatusforRoster$l3$pSelectStatus=true');
    expect(vtTickRequest(session, tokens, 3).body).toContain('BaseReference=pyDisplayHarness.EligibleStatusforRoster(3)');

    const { body } = vtStatusRefreshRequest(session, 2);
    expect(body).toContain('$l1$pSelectStatus=true&$PpyDisplayHarness$pEligibleStatusforRoster$l2$pSelectStatus=true&$PpyDisplayHarness$pEligibleStatusforRoster$l3$pSelectStatus=false');
    expect(body).toContain('pzuiactionzzz=STATUSES%3D*');
    expect(body).toContain('FindAProfessionalInput%7CRule-HTML-Section%7C%7C%7C%7CY%7CSID222');
  });

  it('press Download, and say where the spreadsheet comes from', () => {
    expect(vtDownloadRequest(session).body.startsWith('pzuiactionzzz=DOWNLOAD%3D*&')).toBe(true);
    expect(vtSpreadsheetUrl(session)).toBe(
      `https://site.example/prweb/App/x*/!STANDARD?pyActivity=%40baseclass.pzProcessURLInWindow&pyPreActivity=NGLPGenerateRosterDownload&pzPrimaryPageName=pyDisplayHarness&target=popup&pzHarnessID=HID${'B'.repeat(32)}`,
    );
  });

  it('never send anything about the staff', () => {
    // Everything sent is fixed text and the state's own tokens: nothing here takes a name.
    expect(vtTabRequest.length + vtDownloadRequest.length).toBe(2);
  });
});

describe('the roster as a row, and read back', () => {
  const line = { LicenseNumber: '146.0119635', Status: 'Active', 'First Name': 'Erin Marie', 'Middle Name': 'Carroll', 'Last Name': 'Russell', City: 'Plainfield', State: 'VT', Address1: '1 Main St', Zip: '05667', 'License Expiration': '07/31/2028', Supervisor: 'Someone', Employer: 'Somewhere' };

  it('keeps the name, place, status and expiry, and the type it was downloaded as', () => {
    const row = vtRow(line, 'Applied Behavior Analyst');
    expect(Object.keys(row)).toEqual(VT_CSV_HEADERS);
    expect(row).toMatchObject({ 'License Number': '146.0119635', 'License Type': 'Applied Behavior Analyst', Status: 'Active', Expires: '07/31/2028' });
    expect(JSON.stringify(row)).not.toMatch(/Main St|05667|Someone|Somewhere/);
  });

  it('is recognised by its headers, and not mistaken for Pennsylvania\'s or Ohio\'s', () => {
    expect(identifyVtLicenseFile(VT_CSV_HEADERS)).toBe(true);
    expect(identifyPaLicenseFile(VT_CSV_HEADERS)).toBe(false);
    expect(identifyOhLicenseFile(VT_CSV_HEADERS)).toBe(false);
    expect(identifyVtLicenseFile(['License Number', 'License Type', 'Board', 'Status', 'Sub Status', 'First Name', 'Last Name', 'Expiration Date'])).toBe(false);
  });

  it('gives a license the way the matcher reads it', () => {
    expect(toVtLicenseRecords([vtRow(line, 'Applied Behavior Analyst')])).toEqual([
      {
        jurisdiction: 'VT', number: '146.0119635', type: 'Applied Behavior Analyst', status: 'Active', firstName: 'Erin Marie', middleName: 'Carroll',
        lastName: 'Russell', suffix: '', city: 'Plainfield', state: 'VT', expires: '2028-07-31',
      },
    ]);
  });

  it('offers every type the profession has, Applied first', () => {
    expect(VT_LICENSE_TYPES[0]).toEqual({ id: 'NGLP146', name: 'Applied Behavior Analyst' });
    expect(new Set(VT_LICENSE_TYPES.map((type) => type.id)).size).toBe(VT_LICENSE_TYPES.length);
  });

  it('is a jurisdiction the report can name', () => {
    expect(JURISDICTIONS.VT.name).toBe('Vermont');
  });

  it('reads Active as current, Expired as expired, and the rest for someone to look at', () => {
    const staff = [{ id: '1', firstName: 'Erin', lastName: 'Russell', chosenName: '', credentials: 'BCBA', active: true }];
    const outcome = (status, expires) => matchLicenses(staff, toVtLicenseRecords([vtRow({ ...line, Status: status, 'License Expiration': expires }, 'Applied Behavior Analyst')]), '2026-09-20')[0].outcome;
    expect(outcome('Active', '07/31/2028')).toBe('current');
    expect(outcome('Active', '10/01/2026')).toBe('expiring');
    expect(outcome('Expired', '07/31/2026')).toBe('expired');
    expect(outcome('Surrendered', '07/31/2028')).toBe('review');
    expect(outcome('Renewal Extension', '07/31/2026')).toBe('review');
  });
});
