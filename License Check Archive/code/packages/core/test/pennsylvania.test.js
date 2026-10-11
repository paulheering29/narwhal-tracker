import { describe, it, expect } from 'vitest';
import {
  paSearchBody,
  paRow,
  collectPa,
  identifyPaLicenseFile,
  toPaLicenseRecords,
  matchLicenses,
  PA_CSV_HEADERS,
  PA_PAGE_SIZE,
  PA_RESULT_CAP,
  JURISDICTIONS,
} from '../src/index.js';

const palsPerson = (overrides = {}) => ({
  LicenseNumber: 'BH000058', LicenceType: 'Behavior Specialist', BoardName: 'State Board of Medicine', Status: 'Active',
  FirstName: 'KRISTIE', MiddleName: 'KAY', LastName: 'ABBS', NameSuffix: '', City: 'Wexford', State: 'Pennsylvania', County: 'Allegheny',
  PhoneNo1: '7246122119', Emailid1: 'someone@example.com', AddressLine1: '1 Main St', zipcode: '15090', TotalRecords: 1, ...overrides,
});

describe('the PALS search', () => {
  it('asks for Behavior Specialists, a page at a time', () => {
    expect(paSearchBody({ page: 3 })).toMatchObject({ ProfessionID: 37, LicenseTypeId: 180, PageNo: 3, OptPersonFacility: 'Person' });
    expect(paSearchBody({ page: 1 })).not.toHaveProperty('LastName');
  });

  it('narrows by the start of a last name', () => {
    expect(paSearchBody({ prefix: 'sm', page: 1 }).LastName).toBe('sm');
  });
});

describe('a person from PALS, as a row', () => {
  it('keeps the name, status and place', () => {
    const row = paRow(palsPerson());
    expect(row).toMatchObject({ 'License Number': 'BH000058', Status: 'Active', 'First Name': 'KRISTIE', 'Last Name': 'ABBS', County: 'Allegheny' });
    expect(Object.keys(row)).toEqual(PA_CSV_HEADERS);
  });

  it('leaves out the phone, email and address that PALS sends with every row', () => {
    expect(JSON.stringify(paRow(palsPerson()))).not.toMatch(/7246122119|example\.com|Main St|15090/);
  });
});

describe('the Pennsylvania file', () => {
  const row = (overrides) => ({ ...paRow(palsPerson()), ...overrides });

  it('is recognised by its headers, and not mistaken for Ohio\'s', () => {
    expect(identifyPaLicenseFile(PA_CSV_HEADERS)).toBe(true);
    expect(identifyPaLicenseFile(['License Number', 'License Type', 'Board', 'Status', 'Sub Status', 'First Name', 'Last Name', 'Expiration Date'])).toBe(false);
  });

  it('gives a license the way the matcher reads it, with no expiry', () => {
    expect(toPaLicenseRecords([row()])).toEqual([
      {
        jurisdiction: 'PA', number: 'BH000058', type: 'Behavior Specialist', status: 'Active', firstName: 'KRISTIE', middleName: 'KAY',
        lastName: 'ABBS', suffix: '', city: 'Wexford', state: 'Pennsylvania', expires: null,
      },
    ]);
  });

  it('is a jurisdiction the report can name', () => {
    expect(JURISDICTIONS.PA.name).toBe('Pennsylvania');
  });

  it('reads Active as current, Expired as expired, and anything else for someone to look at', () => {
    const staff = [{ id: '1', firstName: 'Kristie', lastName: 'Abbs', chosenName: '', credentials: 'BCBA', active: true }];
    const outcome = (status) => matchLicenses(staff, toPaLicenseRecords([row({ Status: status })]), '2026-09-20')[0].outcome;
    expect(outcome('Active')).toBe('current');
    expect(outcome('Expired')).toBe('expired');
    expect(outcome('Suspension')).toBe('review');
    expect(outcome('Inactive')).toBe('review');
  });
});

describe('collecting every person', () => {
  const people = (count, tag, total = count) => Array.from({ length: count }, (_, i) => palsPerson({ LicenseNumber: `${tag}${i}`, TotalRecords: total }));
  /** A fake PALS: `totals` says how many a prefix matches; pages are handed out fifty at a time. */
  const fake = (totals) => {
    const asked = [];
    const searchPage = async (prefix, page) => {
      asked.push(`${prefix}:${page}`);
      const total = Math.min(totals(prefix), PA_RESULT_CAP);
      const from = (page - 1) * PA_PAGE_SIZE;
      const count = Math.max(0, Math.min(PA_PAGE_SIZE, total - from));
      return Array.from({ length: count }, (_, i) => palsPerson({ LicenseNumber: `${prefix}#${from + i}`, TotalRecords: total }));
    };
    return { asked, searchPage };
  };

  it('takes every page of a search that is not full', async () => {
    const { asked, searchPage } = fake((prefix) => (prefix === '' ? 120 : 0));
    const all = await collectPa(searchPage);
    expect(asked).toEqual([':1', ':2', ':3']);
    expect(all).toHaveLength(120);
  });

  it('splits a search that says 500 by the next letter, and again where a piece says 500', async () => {
    const { asked, searchPage } = fake((prefix) => (prefix === '' || prefix === 'b' ? PA_RESULT_CAP : prefix.length === 2 ? 3 : 0));
    const all = await collectPa(searchPage);
    // '' is full -> 26 letters, 'b' is full -> 26 more; each two-letter piece holds 3 people.
    expect(all).toHaveLength(26 * 3);
    expect(asked.filter((entry) => entry.startsWith(':'))).toEqual([':1']);
  });

  it('counts a person found by two searches once', async () => {
    const searchPage = async (prefix) => (prefix === '' ? [palsPerson({ TotalRecords: 500 })] : [palsPerson({ TotalRecords: 1 })]);
    expect(await collectPa(searchPage)).toHaveLength(1);
  });

  it('says so when a piece cannot be split further', async () => {
    await expect(collectPa(async () => people(50, 'x', PA_RESULT_CAP))).rejects.toThrow(/could not be split further/);
  });
});
