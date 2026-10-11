import { describe, it, expect } from 'vitest';
import {
  resolveRefs,
  readOhioTokens,
  ohioTokensExpire,
  ohioSearchBody,
  ohioSearchResult,
  ohioRow,
  ohioNextPrefixes,
  collectOhio,
  identifyOhLicenseFile,
  toOhLicenseRecords,
  matchLicenses,
  OH_CSV_HEADERS,
  OH_RESULT_CAP,
  JURISDICTIONS,
} from '../src/index.js';

const b64 = (text) => Buffer.from(text).toString('base64');
// What the site issues: base64 of "V1,<base64 of an expiry date>,<signature>,<id>".
const csrf = (expiry) => b64(`V1,${b64(expiry)},signature,xyz`);
const ctx = (expiry = '2026-09-23T21:50:04.605Z') => ({ csrf: csrf(expiry), vid: '066abc', ns: '', ver: 45, authorization: 'jwt' });
const call = (method) => ({ action: 'OH_VerifyLicenseCtlr', method, data: [], type: 'rpc', tid: 4, ctx: ctx() });

const searchPerson = (overrides = {}) => ({
  Applicant: 'Doe , Jane Q', Board: 'Psychology Board', City: 'Columbus', ExpirationDate: '2027-01-31', LicenseId: 'a1',
  Name: 'COBA.00123', RecNumber: 'COBA.00123', State: 'OH', Status: 'Active', SubStatus: '', Type: 'Certified Ohio Behavior Analyst',
  license: { Id: 'a1', Name: 'COBA.00123', MUSW__Applicant__r: { FirstName: 'Jane', MiddleName: 'Q', LastName: 'Doe' } },
  ...overrides,
});

describe("Salesforce's answers", () => {
  it('unfold a shared object written once and referred to after', () => {
    const answer = [{ result: [{ license: { s: 1, v: { Name: 'COBA.1' } } }, { license: { r: 1 } }] }];
    expect(resolveRefs(answer)[0].result).toEqual([{ license: { Name: 'COBA.1' } }, { license: { Name: 'COBA.1' } }]);
  });

  it('unfold a whole answer that comes wrapped', () => {
    const answer = [{ statusCode: 200, result: { s: 2, v: [{ Name: 'A' }] } }];
    expect(ohioSearchResult(answer)).toEqual([{ Name: 'A' }]);
  });

  it('are not a list when the search was refused', () => {
    expect(ohioSearchResult([{ statusCode: 400, message: 'Invalid CSRF token' }])).toBeNull();
    expect(ohioSearchResult([{ statusCode: 200, result: 'nope' }])).toBeNull();
  });
});

describe('the tokens copied from the browser', () => {
  const body = JSON.stringify([call('fetchmetadata'), call('findLicensesForOwner')]);

  it('are read from a copied cURL command', () => {
    const curl = `curl 'https://elicense.ohio.gov/apexremote' \\\n  -H 'cookie: a=b' \\\n  --data-raw '${body}'`;
    expect(readOhioTokens(curl)).toEqual({ csrf: csrf('2026-09-23T21:50:04.605Z'), vid: '066abc', ns: '', ver: 45, authorization: 'jwt' });
  });

  it('are read from the bare JSON body', () => {
    expect(readOhioTokens(body)?.vid).toBe('066abc');
  });

  it('are not found in anything else', () => {
    expect(readOhioTokens('curl https://example.com')).toBeNull();
    expect(readOhioTokens('')).toBeNull();
    expect(readOhioTokens(JSON.stringify([{ action: 'Other', ctx: ctx() }]))).toBeNull();
  });

  it('say when they stop working', () => {
    expect(ohioTokensExpire(ctx())?.toISOString()).toBe('2026-09-23T21:50:04.605Z');
    expect(ohioTokensExpire({ csrf: 'not a token' })).toBeNull();
  });
});

describe('the search', () => {
  it('asks for one board and credential, in one state, by the start of a last name', () => {
    const [search] = ohioSearchBody(ctx(), { state: 'KY', prefix: 'ab' });
    expect(search.method).toBe('findLicensesForOwner');
    expect(search.data[0]).toMatchObject({ board: 'Psychology Board', licenseType: 'Certified Ohio Behavior Analyst', state: 'KY', lastName: 'ab' });
    expect(search.ctx.authorization).toBe('jwt');
  });

  it('is split by the next letter', () => {
    expect(ohioNextPrefixes('ab')).toHaveLength(26);
    expect(ohioNextPrefixes('ab')[0]).toBe('aba');
  });
});

describe('a person from the search, as a row', () => {
  it('takes the name from the structured record', () => {
    const row = ohioRow(searchPerson());
    expect(row).toMatchObject({ 'License Number': 'COBA.00123', 'First Name': 'Jane', 'Middle Name': 'Q', 'Last Name': 'Doe', Status: 'Active' });
    expect(Object.keys(row)).toEqual(OH_CSV_HEADERS);
  });

  it('falls back to the "Last , First Middle" line', () => {
    const row = ohioRow(searchPerson({ license: undefined, Applicant: 'Smith , Ann Marie' }));
    expect(row).toMatchObject({ 'First Name': 'Ann', 'Middle Name': 'Marie', 'Last Name': 'Smith', 'License Number': 'COBA.00123' });
  });

  it('leaves out the street address', () => {
    expect(JSON.stringify(ohioRow(searchPerson({ streetaddress: '1 Main St', zipcode: '43215' })))).not.toMatch(/Main St|43215/);
  });
});

describe('the Ohio file', () => {
  const row = (overrides) => ({ ...ohioRow(searchPerson()), ...overrides });

  it('is recognised by its headers', () => {
    expect(identifyOhLicenseFile(OH_CSV_HEADERS)).toBe(true);
    expect(identifyOhLicenseFile(['Name', 'License Number', 'Status'])).toBe(false);
  });

  it('gives a license the way the matcher reads it', () => {
    expect(toOhLicenseRecords([row()])).toEqual([
      {
        jurisdiction: 'OH', number: 'COBA.00123', type: 'Certified Ohio Behavior Analyst', status: 'Active', firstName: 'Jane', middleName: 'Q',
        lastName: 'Doe', suffix: '', city: 'Columbus', state: 'OH', expires: '2027-01-31',
      },
    ]);
  });

  it('drops applications that came to nothing, and credentials given up', () => {
    const rows = [
      row({ 'License Number': 'APP-1', Status: 'Closed', 'Sub Status': 'Abandoned' }),
      row({ 'License Number': 'COBA.2', Status: 'Inactive', 'Sub Status': 'Withdrawn' }),
      row({ 'License Number': 'COBA.3' }),
    ];
    expect(toOhLicenseRecords(rows).map((l) => l.number)).toEqual(['COBA.3']);
  });

  it('records a lapsed license as Expired, and keeps an application in progress', () => {
    const [expired, applying] = toOhLicenseRecords([
      row({ 'License Number': 'COBA.4', Status: 'Inactive', 'Sub Status': 'Expired' }),
      row({ 'License Number': 'APP-5', Status: 'Submitted', 'Expiration Date': '' }),
    ]);
    expect(expired.status).toBe('Expired');
    expect(applying).toMatchObject({ status: 'Submitted', expires: null });
  });

  it('is a jurisdiction the report can name', () => {
    expect(JURISDICTIONS.OH.name).toBe('Ohio');
  });
});

describe('a person from Ohio in a check', () => {
  const staff = [{ id: '1', firstName: 'Jane', lastName: 'Doe', chosenName: '', credentials: 'BCBA', active: true }];
  const lic = (overrides) => ({ ...toOhLicenseRecords([ohioRow(searchPerson())])[0], ...overrides });

  it('is current with a live Active license', () => {
    expect(matchLicenses(staff, [lic()], '2026-09-20')[0].outcome).toBe('current');
  });

  it('needs review while only an application is in', () => {
    expect(matchLicenses(staff, [lic({ number: 'APP-1', status: 'Submitted', expires: null })], '2026-09-20')[0].outcome).toBe('review');
  });

  it('is not thrown off by a namesake who has only applied', () => {
    const others = [
      lic(),
      lic({ number: 'APP-9', status: 'Submitted', expires: null, middleName: '' }),
    ];
    expect(matchLicenses(staff, others, '2026-09-20')[0].outcome).not.toBe('multiple');
  });
});

describe('collecting every person', () => {
  const people = (n, tag) => Array.from({ length: n }, (_, i) => ({ LicenseId: `${tag}${i}` }));

  it('asks once per state when no answer is full', async () => {
    const asked = [];
    const all = await collectOhio(async (state, prefix) => (asked.push(`${state}:${prefix}`), people(2, `${state}-`)), { states: ['OH', 'KY'] });
    expect(asked).toEqual(['OH:', 'KY:']);
    expect(all).toHaveLength(4);
  });

  it('splits a full answer by letter, and a full piece by another', async () => {
    const asked = [];
    const search = async (state, prefix) => {
      asked.push(prefix);
      if (prefix === '' || prefix === 'a') return people(OH_RESULT_CAP, `full${prefix}`);
      return prefix.length === 2 ? people(1, `p${prefix}`) : people(2, `p${prefix}`);
    };
    const all = await collectOhio(search, { states: ['OH'] });
    // '' (full) -> 26 letters, of which 'a' is full -> 26 more, each a piece of one.
    expect(asked).toHaveLength(1 + 26 + 26);
    expect(all).toHaveLength(25 * 2 + 26);
  });

  it('counts a person found by two searches once', async () => {
    const all = await collectOhio(async () => [{ LicenseId: 'same' }], { states: ['OH', 'KY'] });
    expect(all).toHaveLength(1);
  });

  it('says so when a piece cannot be split further', async () => {
    await expect(collectOhio(async () => people(OH_RESULT_CAP, 'x'), { states: ['OH'] })).rejects.toThrow(/could not be split further/);
  });

  it('reports each state as it finishes', async () => {
    const done = [];
    await collectOhio(async () => [], { states: ['OH', 'KY'], onProgress: (n, state) => done.push([n, state]) });
    expect(done).toEqual([[1, 'OH'], [2, 'KY']]);
  });
});
