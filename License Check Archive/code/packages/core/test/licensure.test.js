import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  nameKey,
  nameTokens,
  identifyMassLicenseFile,
  toMassLicenseRecords,
  massExportDate,
  massExportUrl,
  massExportKey,
  pickMassBehaviorAnalystExports,
  MASS_EXPORT_LIST_URL,
  splitCommaName,
  splitPlainName,
  identifyTxLicenseFile,
  toTxLicenseRecords,
  txExtractUrl,
  identifyIlLicenseFile,
  toIlLicenseRecords,
  ilExtractUrl,
  identifyCtLicenseFile,
  toCtLicenseRecords,
  ctExtractUrl,
  identifyWaLicenseFile,
  toWaLicenseRecords,
  waExtractUrl,
  tidyAzText,
  identifyAzLicenseFile,
  toAzLicenseRecords,
  identifyNjLicenseFile,
  toNjLicenseRecords,
  NJ_BULK_SEARCH_URL,
  NJ_PROFESSION,
  formFields,
  identifyRiLicenseFile,
  toRiLicenseRecords,
  riExportDate,
  RI_EXTRACT_URL,
  RI_PROFESSION,
  JURISDICTIONS,
  jurisdictionName,
  toStaffRecords,
  matchLicenses,
  daysUntil,
  OUTCOMES,
} from '../src/index.js';
import { CONTACT_HEADER, contactRow } from './helpers.js';

const TODAY = '2026-09-20';

const license = (overrides) => ({
  jurisdiction: 'MA', number: 'LABA1', type: 'Licensed Applied Behavior Analyst License', status: 'Current',
  firstName: 'Jane', middleName: '', lastName: 'Doe', suffix: '', city: 'Boston', state: 'MA', expires: '2027-12-31',
  ...overrides,
});
const person = (overrides) => ({ id: '1', firstName: 'Jane', lastName: 'Doe', chosenName: '', credentials: 'BCBA', active: true, ...overrides });
const one = (staff, licenses) => matchLicenses([person(staff)], licenses, TODAY)[0];

describe('names', () => {
  it('agree across case, accents, punctuation and spacing', () => {
    expect(nameKey("O'Brien")).toBe('obrien');
    expect(nameKey('OBRIEN')).toBe('obrien');
    expect(nameKey('O Brien')).toBe('obrien');
    expect(nameKey('José')).toBe('jose');
    expect(nameKey('  Mary-Ann ')).toBe('maryann');
    expect(nameKey(undefined)).toBe('');
  });

  it('split into the words a name is made of', () => {
    expect(nameTokens('Smith-Jones')).toEqual(['smith', 'jones']);
    expect(nameTokens("De La Cruz")).toEqual(['de', 'la', 'cruz']);
  });
});

describe('the Massachusetts file', () => {
  const HEADERS = ['License Number', 'License Type', 'License Status', 'First Name', 'Middle Name', 'Last Name', 'Suffix',
    'Address 1', 'Address 2', 'City', 'State', 'Zip Code', 'Last Issue/Renewal Date', 'Expiration Date'];

  it('is recognised by its headers, whatever it is called', () => {
    expect(identifyMassLicenseFile(HEADERS)).toBe(true);
    expect(identifyMassLicenseFile(HEADERS.map((h) => h.toLowerCase()))).toBe(true);
  });

  it('is not mistaken for a CentralReach download, or for the metadata file beside it', () => {
    expect(identifyMassLicenseFile(CONTACT_HEADER.split(','))).toBe(false);
    expect(identifyMassLicenseFile(['Column Name', 'Data Type', 'Description'])).toBe(false);
    expect(identifyMassLicenseFile([])).toBe(false);
  });

  it('is read into plain records, trimming stray spaces and turning dates into ISO', () => {
    const { rows, headers } = parseCsv(
      [HEADERS.join(','), 'LABA259,Licensed Applied Behavior Analyst License,Current, Jane ,Q,Doe ,,1 Main St,,Boston,MA,02118,01/05/2024,12/31/2027'].join('\n'),
    );
    expect(headers).toHaveLength(14);
    expect(toMassLicenseRecords(rows)).toEqual([
      {
        jurisdiction: 'MA', number: 'LABA259', type: 'Licensed Applied Behavior Analyst License', status: 'Current',
        firstName: 'Jane', middleName: 'Q', lastName: 'Doe', suffix: '', city: 'Boston', state: 'MA', expires: '2027-12-31',
      },
    ]);
  });

  it('reads when the state generated it, from the name it downloads under', () => {
    expect(massExportDate('Licensed_Applied_Behavior_Analyst_License_Export_2026-09-20T06_14_28.872Z.zip')).toBe('2026-09-20');
    expect(massExportDate('renamed.zip')).toBeNull();
  });
});

describe("the state's list of downloads", () => {
  const entry = (name, licenseMetaId, extra = {}) => ({
    name, storageId: 'x', sizeInBytes: 1000, mimeType: 'application/zip', boardName: 'B', licenseMetaId, createdDate: '2026-09-20T06:14:28.872Z', visible: true, ...extra,
  });
  const listing = [
    entry('Registered_Nurse_License_Export_2026-09-20T06_14_30.000Z.zip', 7),
    entry('Licensed_Applied_Behavior_Analyst_License_Export_2026-09-20T06_14_28.872Z.zip', 30, { sizeInBytes: 217368 }),
    entry('Licensed_Assistant_Applied_Behavior_Analyst_License_Export_2026-09-20T06_14_29.323Z.zip', 32),
    entry('BOARD_OF_REGISTRATION_OF_ALLIED_MENTAL_HEALTH_AND_HUMAN_SERVICES_PROFESSIONS_Export_2026-09-20T06_14_33.000Z.zip', 31),
    entry('Licensed_Mental_Health_Counselor_License_Export_2026-09-20T06_14_31.000Z.zip', 34),
  ];

  it('finds the behavior analyst downloads by name, and leaves everything else', () => {
    expect(pickMassBehaviorAnalystExports(listing).map((e) => [e.id, e.sizeInBytes])).toEqual([[30, 217368], [32, 1000]]);
  });

  it('follows the numbers the list gives, not numbers we remembered', () => {
    const renumbered = listing.map((e) => (e.licenseMetaId === 30 ? { ...e, licenseMetaId: 99 } : e));
    expect(pickMassBehaviorAnalystExports(renumbered).map((e) => e.id)).toEqual([99, 32]);
  });

  it('skips one that is hidden, or has no usable number', () => {
    const odd = [
      entry('Licensed_Applied_Behavior_Analyst_License_Export_x.zip', 30, { visible: false }),
      entry('Licensed_Assistant_Applied_Behavior_Analyst_License_Export_x.zip', null),
    ];
    expect(pickMassBehaviorAnalystExports(odd)).toEqual([]);
  });

  it('finds nothing, rather than throwing, if the list is not the shape we expect', () => {
    for (const bad of [null, undefined, {}, 'html', [null, 3, {}]]) expect(pickMassBehaviorAnalystExports(bad)).toEqual([]);
  });

  it('gives fixed public addresses, and encodes the number it is given', () => {
    expect(MASS_EXPORT_LIST_URL).toBe('https://healthprofessionlicensing-api.mass.gov/api-public/export/all');
    expect(massExportUrl(30)).toBe('https://healthprofessionlicensing-api.mass.gov/api-public/export/data/license/30');
    expect(massExportUrl('30/../x')).toBe('https://healthprofessionlicensing-api.mass.gov/api-public/export/data/license/30%2F..%2Fx');
  });

  it('names a license type the same on every day, so a newer download replaces an older one', () => {
    const today = 'Licensed_Applied_Behavior_Analyst_License_Export_2026-09-20T06_14_28.872Z.zip';
    const lastWeek = 'Licensed_Applied_Behavior_Analyst_License_Export_2026-09-13T06_14_28.100Z.zip';
    expect(massExportKey(today)).toBe(massExportKey(lastWeek));
    expect(massExportKey(today)).toBe('Licensed_Applied_Behavior_Analyst_License');
    expect(massExportKey('Licensed_Assistant_Applied_Behavior_Analyst_License_Export_2026-09-20T06_14_29.323Z.zip')).not.toBe(massExportKey(today));
    expect(massExportKey('my licenses.zip')).toBe('my licenses');
  });
});

describe('the Rhode Island file', () => {
  const HEADERS = ['Name', 'First', 'Middle', 'Last', 'Owner Manager Name', 'License No', 'Profession', 'License Type', 'Status', 'Issue Date', 'Specialty',
    'Expiration Date', 'License Address Line 1', 'License Address Line 2', 'License Address Line 3', 'City', 'State', 'Zip', 'Phone', 'Fax', 'Total Capacity Beds'];
  const row = (values) => HEADERS.map((h) => JSON.stringify(values[h] ?? '')).join(',');
  const aba = (extra) => row({ First: 'SOFIA', Middle: 'ELIZABETH', Last: 'ABUIN', 'License No': 'LBA00493', Profession: 'Applied Behavior Analyst', 'License Type': 'Applied Behavior Analyst', Status: 'Active', 'Issue Date': '08/18/2025', 'Expiration Date': '06/30/2028', City: 'NORTH KINGSTOWN', State: 'RI', Phone: '(401) 555-0100', ...extra });

  it('is recognised by its headers, and is not mistaken for the other kinds of file', () => {
    expect(identifyRiLicenseFile(HEADERS)).toBe(true);
    expect(identifyRiLicenseFile(['License Number', 'License Type', 'License Status', 'First Name', 'Last Name', 'Expiration Date'])).toBe(false);
    expect(identifyRiLicenseFile(CONTACT_HEADER.split(','))).toBe(false);
    expect(identifyRiLicenseFile([])).toBe(false);
  });

  it('is read into the same plain records as any other state, leaving behind phone numbers and everything else', () => {
    const { rows } = parseCsv([HEADERS.join(','), aba()].join('\n'));
    const [record] = toRiLicenseRecords(rows);
    expect(record).toEqual({
      jurisdiction: 'RI', number: 'LBA00493', type: 'Applied Behavior Analyst', status: 'Active', firstName: 'SOFIA', middleName: 'ELIZABETH',
      lastName: 'ABUIN', suffix: '', city: 'NORTH KINGSTOWN', state: 'RI', expires: '2028-06-30',
    });
    expect(JSON.stringify(record)).not.toMatch(/555/);
  });

  it('keeps the assistant type too -- it is spelled "Behavior Assistant Analyst" -- but nothing else in a whole-state file', () => {
    const { rows } = parseCsv(
      [
        HEADERS.join(','),
        aba(),
        aba({ 'License No': 'LABA00010', 'License Type': 'Applied Behavior Assistant Analyst', First: 'JO', Middle: '', Last: 'ROE' }),
        row({ Name: 'A BAR', 'License No': 'FSV1', Profession: 'Food Service', 'License Type': 'Seats - Less than 50', Status: 'Active', 'Expiration Date': '04/30/2027' }),
        row({ First: 'PAT', Last: 'LEE', 'License No': 'PT1', Profession: 'Physical Therapy', 'License Type': 'Physical Therapist', Status: 'Active', 'Expiration Date': '04/30/2027' }),
      ].join('\n'),
    );
    expect(toRiLicenseRecords(rows).map((r) => r.number)).toEqual(['LBA00493', 'LABA00010']);
  });

  it('turns the state\'s "NA" address into no address at all', () => {
    const { rows } = parseCsv([HEADERS.join(','), aba({ State: 'NA' })].join('\n'));
    expect(toRiLicenseRecords(rows)[0].state).toBe('');
  });

  it('reads when it was made from the name it downloads under, and knows where it comes from', () => {
    expect(riExportDate('Applied-Behavior-Analyst-licensee-extract-2026-09-20.csv')).toBe('2026-09-20');
    expect(riExportDate('-licensee-extract-2026-09-20.csv')).toBe('2026-09-20');
    expect(riExportDate('renamed.csv')).toBeNull();
    expect(RI_EXTRACT_URL).toBe('https://datahealth.ri.gov/lists/licensees/download.php');
    expect(RI_PROFESSION).toBe('Applied Behavior Analyst');
  });

  it('is a state whose list holds only active licenses, unlike Massachusetts', () => {
    expect(JURISDICTIONS.RI.activeOnly).toBe(true);
    expect(JURISDICTIONS.MA.activeOnly).toBe(false);
    expect(jurisdictionName('RI')).toBe('Rhode Island');
    expect(jurisdictionName('ZZ')).toBe('ZZ');
  });
});

describe('the New Jersey file', () => {
  const HEADERS = ['full_name', 'first_name', 'middle_name', 'last_name', 'name_suffix', 'profession_name', 'license_type_name', 'license_no', 'issue_date',
    'expiration_date', 'addr_line_1', 'addr_line_2', 'addr_city', 'addr_state', 'addr_zipcode', 'addr_county', 'addr_email', 'license_status_name', ''];
  const line = (v) => HEADERS.map((h) => v[h] ?? '').join('|');
  const person = (extra) => line({ first_name: 'Jane', last_name: 'Doe', profession_name: 'Applied Behavior Analysts', license_type_name: 'Applied Behavior Analyst',
    license_no: '15BC00312300', issue_date: '12/17/2025', expiration_date: '6/30/2028', addr_city: 'Jackson', addr_state: 'NJ', addr_email: 'jane@example.com', license_status_name: 'Active', ...extra });
  const read = (...lines) => parseCsv([HEADERS.join('|'), ...lines].join('\n'));

  it('is recognised by its headers -- the file is called "Data.txt" -- and by nothing else', () => {
    expect(identifyNjLicenseFile(HEADERS)).toBe(true);
    expect(identifyNjLicenseFile(CONTACT_HEADER.split(','))).toBe(false);
    expect(identifyNjLicenseFile(['License Number', 'License Type', 'License Status', 'First Name', 'Last Name', 'Expiration Date'])).toBe(false);
  });

  it('is read by the same parser, which finds the pipes itself', () => {
    const { headers, rows } = read(person(), person({ first_name: 'Jo' }));
    expect(headers).toHaveLength(19);
    expect(rows).toHaveLength(2);
  });

  it('is read into plain records, without the email address', () => {
    const [record] = toNjLicenseRecords(read(person()).rows);
    expect(record).toEqual({
      jurisdiction: 'NJ', number: '15BC00312300', type: 'Applied Behavior Analyst', status: 'Active', firstName: 'Jane', middleName: '', lastName: 'Doe',
      suffix: '', city: 'Jackson', state: 'NJ', expires: '2028-06-30',
    });
    expect(JSON.stringify(record)).not.toMatch(/example\.com/);
  });

  it('keeps an applicant, who has no number and no dates, and says so through the status', () => {
    const [record] = toNjLicenseRecords(read(person({ license_no: '', issue_date: '', expiration_date: '', license_status_name: 'Pending', addr_state: 'TX' })).rows);
    expect(record).toMatchObject({ number: '', status: 'Pending', expires: null, state: 'TX' });
  });

  it('leaves out an application that was withdrawn and a record that was deleted', () => {
    const { rows } = read(person(), person({ license_status_name: 'Withdrawn', license_no: '' }), person({ license_status_name: 'Deleted', license_no: '' }), person({ license_status_name: 'Inactive' }));
    expect(toNjLicenseRecords(rows).map((r) => r.status)).toEqual(['Active', 'Inactive']);
  });

  it('is New Jersey, and publishes every status, unlike Rhode Island', () => {
    expect(jurisdictionName('NJ')).toBe('New Jersey');
    expect(JURISDICTIONS.NJ.activeOnly).toBe(false);
  });
});

describe('names written as one line', () => {
  it('takes "LAST, FIRST MIDDLE" apart, keeping a many-word or hyphenated last name whole', () => {
    expect(splitCommaName('KEALOHA, MONA RAE')).toEqual({ firstName: 'MONA', middleName: 'RAE', lastName: 'KEALOHA', suffix: '' });
    expect(splitCommaName('DE LA CRUZ, ANA')).toEqual({ firstName: 'ANA', middleName: '', lastName: 'DE LA CRUZ', suffix: '' });
    expect(splitCommaName('SMITH-JONES, PAT M')).toEqual({ firstName: 'PAT', middleName: 'M', lastName: 'SMITH-JONES', suffix: '' });
    expect(splitCommaName('MARY ANN LEE, JO')).toMatchObject({ firstName: 'JO', lastName: 'MARY ANN LEE' });
  });

  it('sets a suffix aside wherever it sits', () => {
    expect(splitCommaName('SMITH, JOHN A, JR')).toMatchObject({ firstName: 'JOHN', middleName: 'A', lastName: 'SMITH', suffix: 'JR' });
    expect(splitCommaName('SMITH JR, JOHN')).toMatchObject({ firstName: 'JOHN', lastName: 'SMITH', suffix: 'JR' });
    expect(splitCommaName('SMITH, JOHN III')).toMatchObject({ firstName: 'JOHN', lastName: 'SMITH', suffix: 'III' });
  });

  it('copes with nothing, or with a single word', () => {
    expect(splitCommaName('')).toEqual({ firstName: '', middleName: '', lastName: '', suffix: '' });
    expect(splitCommaName('MADONNA')).toMatchObject({ firstName: '', lastName: 'MADONNA' });
    expect(splitPlainName('')).toEqual({ firstName: '', middleName: '', lastName: '', suffix: '' });
    expect(splitPlainName('MADONNA')).toMatchObject({ firstName: '', lastName: 'MADONNA' });
  });

  it('takes "FIRST MIDDLE LAST" apart by taking the last word as the last name', () => {
    expect(splitPlainName('LUIS VERA')).toEqual({ firstName: 'LUIS', middleName: '', lastName: 'VERA', suffix: '' });
    expect(splitPlainName('HEATHER ASHLEY ANN KIRK')).toEqual({ firstName: 'HEATHER', middleName: 'ASHLEY ANN', lastName: 'KIRK', suffix: '' });
    expect(splitPlainName('JOHN Q SMITH JR')).toEqual({ firstName: 'JOHN', middleName: 'Q', lastName: 'SMITH', suffix: 'JR' });
  });

  it('leaves a many-word last name to be found as a possible match, not missed', () => {
    const cruz = { ...license({ jurisdiction: 'CT' }), ...splitPlainName('ANA DE LA CRUZ') }; // last name comes out as CRUZ
    const result = one({ firstName: 'Ana', lastName: 'De La Cruz' }, [cruz]);
    expect(result.outcome).toBe('possible');
  });
});

describe('the Texas file', () => {
  const HEADERS = ['license_type', 'license_number', 'owner_name', 'license_expiration_date_mmddccyy'];
  const read = (...rows) => parseCsv([HEADERS.join(','), ...rows].join('\n'));

  it('is recognised by its headers, including in the whole-state dataset', () => {
    expect(identifyTxLicenseFile(HEADERS)).toBe(true);
    expect(identifyTxLicenseFile([...HEADERS, 'business_name', 'business_telephone', 'owner_telephone'])).toBe(true);
    expect(identifyTxLicenseFile(CONTACT_HEADER.split(','))).toBe(false);
    expect(identifyTxLicenseFile(['license_number', 'license_status', 'description', 'first_name', 'last_name', 'expiration_date'])).toBe(false);
  });

  it('is read into plain records with no status -- the state does not give one', () => {
    const [record] = toTxLicenseRecords(read('"Licensed Behavior Analyst",BHV-1234,"KEALOHA, MONA RAE",5/11/2028').rows);
    expect(record).toEqual({
      jurisdiction: 'TX', number: 'BHV-1234', type: 'Licensed Behavior Analyst', status: '', firstName: 'MONA', middleName: 'RAE',
      lastName: 'KEALOHA', suffix: '', city: '', state: '', expires: '2028-05-11',
    });
  });

  it('keeps the assistants and nothing else in a whole-state file', () => {
    const { rows } = read(
      '"Licensed Behavior Analyst",BHV-1,"A, B",1/1/2030',
      '"Licensed Assistant Behavior Analyst",BHV-2,"C, D",1/1/2030',
      '"Cosmetologist",COS-1,"E, F",1/1/2030',
      '"Barber",BAR-1,"G, H",1/1/2030',
    );
    expect(toTxLicenseRecords(rows).map((r) => r.number)).toEqual(['BHV-1', 'BHV-2']);
  });

  it('asks for four columns only -- no addresses, no phone numbers', () => {
    const url = new URL(txExtractUrl());
    expect(url.origin + url.pathname).toBe('https://data.texas.gov/resource/7358-krk7.csv');
    expect(url.searchParams.get('$select').split(',')).toEqual(['license_type', 'license_number', 'owner_name', 'license_expiration_date_mmddccyy']);
  });
});

describe('a list with no status column', () => {
  const tx = (overrides) => license({ jurisdiction: 'TX', status: '', number: 'BHV-1', ...overrides });

  it('is judged by its expiry date alone', () => {
    expect(one({}, [tx({ expires: '2028-01-01' })]).outcome).toBe('current');
    expect(one({}, [tx({ expires: '2026-11-01' })]).outcome).toBe('expiring');
    expect(one({}, [tx({ expires: '2026-09-19' })]).outcome).toBe('expired');
  });

  it('needs review when it has no date either, since then there is nothing to judge by', () => {
    expect(one({}, [tx({ expires: null })]).outcome).toBe('review');
  });

  it('is Texas, and says so plainly in its note', () => {
    expect(jurisdictionName('TX')).toBe('Texas');
    expect(JURISDICTIONS.TX.note).toMatch(/suspended or revoked/);
  });
});

describe('the Illinois file', () => {
  const HEADERS = ['license_number', 'description', 'license_status', 'first_name', 'middle', 'last_name', 'suffix', 'expiration_date', 'city', 'state'];
  const line = (v) => HEADERS.map((h) => JSON.stringify(v[h] ?? '')).join(',');
  const row = (extra) => line({ license_number: '036123456', description: 'LICENSED BEHAVIORAL ANALYST', license_status: 'ACTIVE', first_name: 'MONA', middle: 'RAE', last_name: 'KEALOHA', expiration_date: '10/31/2027', city: 'CHICAGO', state: 'IL', ...extra });
  const read = (...rows) => parseCsv([HEADERS.join(','), ...rows].join('\n'));

  it('is recognised by its headers, and not mistaken for Texas', () => {
    expect(identifyIlLicenseFile(HEADERS)).toBe(true);
    expect(identifyTxLicenseFile(HEADERS)).toBe(false);
    expect(identifyIlLicenseFile(['license_type', 'license_number', 'owner_name', 'license_expiration_date_mmddccyy'])).toBe(false);
  });

  it('finds them under "BEHAVIORAL ANALYST" -- spelled with -AL -- and leaves out everyone else', () => {
    const { rows } = read(
      row(),
      row({ license_number: '2', description: 'LICENSED ASSISTANT BEHAVIORAL ANALYST' }),
      row({ license_number: '3', description: 'REGISTERED NURSE' }),
      row({ license_number: '4', description: 'LICENSED SOCIAL WORKER' }),
    );
    expect(toIlLicenseRecords(rows).map((r) => r.number)).toEqual(['036123456', '2']);
    expect(toIlLicenseRecords(rows)[0]).toMatchObject({ jurisdiction: 'IL', type: 'LICENSED BEHAVIORAL ANALYST', status: 'ACTIVE', expires: '2027-10-31' });
  });

  it('calls NOT RENEWED expired, and a voluntary surrender something to review', () => {
    const il = (status) => license({ jurisdiction: 'IL', status, expires: '2027-10-31' });
    expect(one({}, [il('ACTIVE')]).outcome).toBe('current');
    expect(one({}, [il('NOT RENEWED')]).outcome).toBe('expired');
    expect(one({}, [il('VOLUNTARY SURRENDER')]).outcome).toBe('review');
  });

  it('asks for the analysts by description, not by the board\'s type', () => {
    const url = new URL(ilExtractUrl());
    expect(url.origin + url.pathname).toBe('https://data.illinois.gov/resource/pzzh-kp68.csv');
    expect(url.searchParams.get('$where')).toMatch(/BEHAVIORAL ANALYST/);
  });
});

describe('the Connecticut file', () => {
  const HEADERS = ['credentialnumber', 'name', 'credential', 'type', 'status', 'statusreason', 'expirationdate', 'city', 'state'];
  const line = (v) => HEADERS.map((h) => JSON.stringify(v[h] ?? '')).join(',');
  const row = (extra) => line({ credentialnumber: '1234', name: 'SUZANNE JANE LETSO', credential: 'Behavior Analyst', type: 'INDIVIDUAL', status: 'ACTIVE', statusreason: 'CURRENT', expirationdate: '2027-10-31T00:00:00.000', city: 'HARTFORD', state: 'CT', ...extra });
  const read = (...rows) => parseCsv([HEADERS.join(','), ...rows].join('\n'));

  it('is recognised by its headers, and not mistaken for Washington', () => {
    expect(identifyCtLicenseFile(HEADERS)).toBe(true);
    expect(identifyWaLicenseFile(HEADERS)).toBe(false);
    expect(identifyCtLicenseFile(['credentialnumber', 'lastname', 'firstname', 'middlename', 'credentialtype', 'status', 'expirationdate'])).toBe(false);
  });

  it('is read into plain records, taking the name apart', () => {
    const [record] = toCtLicenseRecords(read(row()).rows);
    expect(record).toEqual({
      jurisdiction: 'CT', number: '1234', type: 'Behavior Analyst', status: 'ACTIVE', firstName: 'SUZANNE', middleName: 'JANE', lastName: 'LETSO',
      suffix: '', city: 'HARTFORD', state: 'CT', expires: '2027-10-31',
    });
  });

  it('records a license that ran out as Lapsed, and drops an application that came to nothing and a corporation', () => {
    const { rows } = read(
      row({ credentialnumber: '1', status: 'INACTIVE', statusreason: 'LAPSED DUE TO NON-RENEWAL', expirationdate: '2022-08-31T00:00:00.000' }),
      row({ credentialnumber: '2', status: 'EXPIRED APPLICATION', statusreason: 'EXPIRED APPLICATION', expirationdate: '' }),
      row({ credentialnumber: '3', type: 'CORPORATION' }),
      row({ credentialnumber: '4', status: 'PENDING', statusreason: 'PENDING', expirationdate: '' }),
    );
    expect(toCtLicenseRecords(rows).map((r) => [r.number, r.status])).toEqual([['1', 'Lapsed'], ['4', 'PENDING']]);
  });

  it('calls a lapsed license expired, an approved one licensed, and a renewal in progress current -- until its date has passed', () => {
    const ct = (status, expires) => license({ jurisdiction: 'CT', status, expires });
    expect(one({}, [ct('Lapsed', '2022-08-31')]).outcome).toBe('expired');
    expect(one({}, [ct('APPROVED', '2028-01-01')]).outcome).toBe('current');
    expect(one({}, [ct('ACTIVE IN RENEWAL', '2028-01-01')]).outcome).toBe('current');
    expect(one({}, [ct('ACTIVE IN RENEWAL', '2026-08-31')]).outcome).toBe('review');
    expect(one({}, [ct('ACTIVE', '2026-08-31')]).outcome).toBe('expired');
    expect(one({}, [ct('PENDING', null)]).outcome).toBe('review');
  });

  it('asks only for the behavior analysts', () => {
    const url = new URL(ctExtractUrl());
    expect(url.origin + url.pathname).toBe('https://data.ct.gov/resource/ngch-56tr.csv');
    expect(url.searchParams.get('$where')).toBe("credential = 'Behavior Analyst'");
  });
});

describe('the Washington file', () => {
  const HEADERS = ['credentialnumber', 'lastname', 'firstname', 'middlename', 'credentialtype', 'status', 'firstissuedate', 'lastissuedate', 'expirationdate', 'actiontaken'];
  const line = (v) => HEADERS.map((h) => JSON.stringify(v[h] ?? '')).join(',');
  const row = (extra) => line({ credentialnumber: 'LBA.BA.60000001', lastname: 'Kealoha', firstname: 'Mona', middlename: 'Rae', credentialtype: 'Licensed Behavior Analyst', status: 'Active', firstissuedate: '07/01/2017', lastissuedate: '02/25/2022', expirationdate: '02/28/2028', actiontaken: 'No', ...extra });
  const read = (...rows) => parseCsv([HEADERS.join(','), ...rows].join('\n'));

  it('is recognised by its headers, and not mistaken for another file', () => {
    expect(identifyWaLicenseFile(HEADERS)).toBe(true);
    expect(identifyWaLicenseFile(CONTACT_HEADER.split(','))).toBe(false);
    expect(identifyWaLicenseFile(['License Number', 'License Type', 'License Status', 'First Name', 'Last Name', 'Expiration Date'])).toBe(false);
  });

  it('is read into plain records', () => {
    const [record] = toWaLicenseRecords(read(row()).rows);
    expect(record).toEqual({
      jurisdiction: 'WA', number: 'LBA.BA.60000001', type: 'Licensed Behavior Analyst', status: 'Active', firstName: 'Mona', middleName: 'Rae',
      lastName: 'Kealoha', suffix: '', city: '', state: '', expires: '2028-02-28',
    });
  });

  it('leaves out the technicians and every other credential, so the whole dataset can be uploaded', () => {
    const { rows } = read(
      row(),
      row({ credentialnumber: 'CBT.1', credentialtype: 'Certified Behavior Technician' }),
      row({ credentialnumber: 'RN.1', credentialtype: 'Registered Nurse' }),
      row({ credentialnumber: 'BH.1', credentialtype: 'Behavioral Health Agency' }),
      row({ credentialnumber: 'LABA.AB.1', credentialtype: 'Licensed Assistant Behavior Analyst' }),
      row({ credentialnumber: 'LBTL.TP.1', credentialtype: 'Licensed Behavior Analyst Temporary License' }),
    );
    expect(toWaLicenseRecords(rows).map((r) => r.number)).toEqual(['LBA.BA.60000001', 'LABA.AB.1', 'LBTL.TP.1']);
  });

  it('drops a replaced credential and an application that came to nothing, but keeps one still pending', () => {
    const { rows } = read(
      row({ status: 'Superseded', credentialnumber: 'LABA.AB.2', credentialtype: 'Licensed Assistant Behavior Analyst' }),
      row({ status: 'Closed', credentialnumber: 'LBA.BA.3', expirationdate: '', lastissuedate: '' }),
      row({ status: 'Denied', credentialnumber: 'LBA.BA.4', expirationdate: '' }),
      row({ status: 'Pending', credentialnumber: 'LBA.BA.5', expirationdate: '' }),
      row({ status: 'Active With Conditions', credentialnumber: 'LBA.BA.6' }),
    );
    expect(toWaLicenseRecords(rows).map((r) => [r.number, r.status, r.expires])).toEqual([
      ['LBA.BA.5', 'Pending', null],
      ['LBA.BA.6', 'Active With Conditions', '2028-02-28'],
    ]);
  });

  it('asks for the behavior analysts only, by column, without the birth year', () => {
    const url = new URL(waExtractUrl());
    expect(url.origin + url.pathname).toBe('https://data.wa.gov/resource/qxh8-f4bd.csv');
    expect(url.searchParams.get('$where')).toBe("upper(credentialtype) like '%BEHAVIOR ANALYST%'");
    expect(url.searchParams.get('$select')).not.toMatch(/birth/i);
    expect(url.searchParams.get('$select')).toContain('credentialnumber');
  });

  it('is Washington, whose list carries applicants', () => {
    expect(jurisdictionName('WA')).toBe('Washington');
    expect(JURISDICTIONS.WA.note).toMatch(/Pending/);
  });
});

describe('telling a person who moved up from a namesake', () => {
  const wa = (overrides) => license({ jurisdiction: 'WA', type: 'Licensed Behavior Analyst', number: 'LBA.1', middleName: 'Rae', ...overrides });
  const assistant = (overrides) => wa({ type: 'Licensed Assistant Behavior Analyst', number: 'LABA.1', ...overrides });

  it('treats an assistant license beside a full one, with the same middle name, as one person', () => {
    const result = one({}, [assistant({ status: 'Expired', expires: '2020-01-01' }), wa()]);
    expect(result.outcome).toBe('current');
    expect(result.matches).toHaveLength(2);
  });

  it('accepts a middle initial as agreeing with the whole name, and a missing middle name as not conflicting', () => {
    expect(one({}, [assistant({ middleName: 'R' }), wa()]).outcome).toBe('current');
    expect(one({}, [assistant({ middleName: '' }), wa()]).outcome).toBe('current');
  });

  it('calls two licenses of the same type two people', () => {
    expect(one({}, [wa({ number: 'LBA.1' }), wa({ number: 'LBA.2' })]).outcome).toBe('multiple');
  });

  it('calls an assistant and a full license with conflicting middle names two people', () => {
    expect(one({}, [assistant({ middleName: 'Dawn' }), wa({ middleName: 'Rae' })]).outcome).toBe('multiple');
  });

  it('finds the namesake even when someone who moved up is beside them', () => {
    const result = one({}, [assistant({ number: 'LABA.1', middleName: 'Rae' }), wa({ number: 'LBA.1', middleName: 'Rae' }), wa({ number: 'LBA.2', middleName: 'Dawn' })]);
    expect(result.outcome).toBe('multiple');
  });

  it('does not count an application as a second person', () => {
    expect(one({}, [wa({ number: 'LBA.1' }), wa({ number: 'LBA.9', status: 'Pending', expires: null })]).outcome).toBe('current');
  });
});

describe('the Arizona file', () => {
  // Exactly as the registry writes it: a space before the first quote, &nbsp; on one header.
  const HEADER = ' "License Number","First Name","Last Name",City,"License Type","License Status&nbsp;&nbsp;","License Expiry Date","Board Actions"';
  const file = (...rows) => [HEADER, ...rows].join('\r\n') + '\r\n';
  const read = (...rows) => parseCsv(tidyAzText(file(...rows)));

  it('cannot be read as it comes, and can once tidied', () => {
    expect(parseCsv(file()).headers[0]).toBe('"License Number"');
    expect(identifyAzLicenseFile(parseCsv(file()).headers)).toBe(false);
    expect(read().headers).toEqual(['License Number', 'First Name', 'Last Name', 'City', 'License Type', 'License Status', 'License Expiry Date', 'Board Actions']);
    expect(identifyAzLicenseFile(read().headers)).toBe(true);
  });

  it('leaves any other text alone', () => {
    const other = 'Id,FirstName\n1,A&nbsp;B\n';
    expect(tidyAzText(other)).toBe(other);
  });

  it('is not mistaken for another state, or for a CentralReach download', () => {
    expect(identifyAzLicenseFile(CONTACT_HEADER.split(','))).toBe(false);
    expect(identifyAzLicenseFile(['License Number', 'License Type', 'License Status', 'First Name', 'Last Name', 'Expiration Date'])).toBe(false);
    expect(identifyMassLicenseFile(read().headers)).toBe(false);
  });

  it('is read into plain records', () => {
    const [record] = toAzLicenseRecords(read('BEH-000136,Lindsay,Abbott,Tucson,"Behavior Analyst",Active,01/31/2028,No').rows);
    expect(record).toEqual({
      jurisdiction: 'AZ', number: 'BEH-000136', type: 'Behavior Analyst', status: 'Active', firstName: 'Lindsay', middleName: '',
      lastName: 'Abbott', suffix: '', city: 'Tucson', state: '', expires: '2028-01-31',
    });
  });

  it('moves a credential off the end of a last name, and a stray comma off a city', () => {
    const rows = read(
      'BEH-000987,Jeannie,"Aguilar, Ph.D.","Farmington Hills","Behavior Analyst",Active,07/31/2027,No',
      'BEH-001355,"Hannah Francesca","Abinuman Perez","Mesa,","Behavior Analyst",Active,03/31/2027,No',
      'BEH-000500,Sam,"Lee, M.S., MBA",Phoenix,"Behavior Analyst",Active,03/31/2027,No',
    ).rows;
    const [a, b, c] = toAzLicenseRecords(rows);
    expect([a.lastName, a.suffix]).toEqual(['Aguilar', 'Ph.D.']);
    expect([b.firstName, b.lastName, b.city]).toEqual(['Hannah Francesca', 'Abinuman Perez', 'Mesa']);
    expect([c.lastName, c.suffix]).toEqual(['Lee', 'M.S., MBA']);
  });

  it('leaves out the registry\'s test records', () => {
    const rows = read(
      'BEH-000136,Lindsay,Abbott,Tucson,"Behavior Analyst",Active,01/31/2028,No',
      'test,Test,Person,Phoenix,"Behavior Analyst",Active,01/31/2028,No',
      'BEH-TEST123,Try,Out,Phoenix,"Behavior Analyst",Active,01/31/2028,No',
    ).rows;
    expect(toAzLicenseRecords(rows).map((r) => r.number)).toEqual(['BEH-000136']);
  });

  it('is Arizona, and lists every status, expired included', () => {
    expect(jurisdictionName('AZ')).toBe('Arizona');
    expect(JURISDICTIONS.AZ.activeOnly).toBe(false);
  });
});

describe('how Arizona\'s statuses read', () => {
  const az = (overrides) => license({ jurisdiction: 'AZ', number: 'BEH-1', ...overrides });

  it('counts Lapsed as expired, and a license Active on paper but past its date as expired too', () => {
    expect(one({}, [az({ status: 'Lapsed', expires: '2025-01-31' })]).outcome).toBe('expired');
    expect(one({}, [az({ status: 'Active', expires: '2026-09-01' })]).outcome).toBe('expired');
  });

  it('flags probation, suspension, surrender and the rest as needing review', () => {
    for (const status of ['Active - Probation', 'Inactive', 'Surrendered', 'Revoked', 'Deceased', 'Suspended pursuant to Arizona Revised Statutes 32-3202', 'Renewal Application Denied']) {
      expect(one({}, [az({ status, expires: '2028-01-31' })]).outcome).toBe('review');
    }
  });

  it('finds a person whose license writes the middle name into the first name', () => {
    expect(one({ firstName: 'Hannah' }, [az({ firstName: 'Hannah Francesca' })]).outcome).toBe('current');
    expect(one({ firstName: 'Francesca' }, [az({ firstName: 'Hannah Francesca' })]).outcome).not.toBe('current');
  });
});

describe("reading a state page's form", () => {
  const html = `
    <form method="post" action="./Search.aspx?facility=N">
      <input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="/wEPDw+UJN==" />
      <input type='hidden' name='__EVENTVALIDATION' value='a&amp;b&quot;c' />
      <input type="text" name="first_name" value="" />
      <input type="checkbox" name="opt_in" value="1" />
      <input type="checkbox" name="opt_out" value="1" checked="checked" />
      <input type="radio" name="filetype" value="excel" /><input type="radio" name="filetype" value="delimitedtext" checked />
      <select name="profession"><option value="All">All</option><option value="ABA" selected="selected">ABA</option></select>
      <select name="status"><option value="">All</option><option value="Active">Active</option></select>
      <select name="plain"><option>Only text</option></select>
      <input type="submit" name="sch_button" value="Search" />
      <input type="button" name="back_button" value="Back" />
    </form>`;

  it('reads the hidden fields, text boxes and chosen options a browser would send back', () => {
    expect(formFields(html)).toEqual({
      __VIEWSTATE: '/wEPDw+UJN==',
      __EVENTVALIDATION: 'a&b"c',
      first_name: '',
      opt_out: '1',
      filetype: 'delimitedtext',
      profession: 'ABA',
      status: '',
      plain: 'Only text',
    });
  });

  it('leaves out buttons, which are the caller\'s to press', () => {
    expect(Object.keys(formFields(html))).not.toContain('sch_button');
    expect(Object.keys(formFields(html))).not.toContain('back_button');
  });

  it('gives nothing for a page with no form', () => {
    expect(formFields('<html><body>maintenance</body></html>')).toEqual({});
  });

  it('starts from New Jersey\'s own bulk search, for behavior analysts', () => {
    expect(NJ_BULK_SEARCH_URL).toBe('https://newjersey.mylicense.com/Verification_Bulk/Search.aspx?facility=N');
    expect(NJ_PROFESSION).toBe('Applied Behavior Analysts');
  });
});

describe('what an applicant, or an expired license, means for a person', () => {
  const nj = (overrides) => license({ jurisdiction: 'NJ', number: '15BC1', status: 'Active', ...overrides });

  it('reports someone who has only applied as needing review, saying Pending', () => {
    const result = one({}, [nj({ number: '', status: 'Pending', expires: null })]);
    expect(result.outcome).toBe('review');
    expect(result.matches[0]).toMatchObject({ status: 'Pending', number: '' });
  });

  it('does not let an application beside an active license make one person look like two', () => {
    const result = one({}, [nj({ number: '15BA1' }), nj({ number: '', status: 'Pending', expires: null })]);
    expect(result.outcome).toBe('current');
    expect(result.matches).toHaveLength(2);
  });

  it('reports a license awaiting reinstatement as needing review, not expired', () => {
    const result = one({}, [nj({ status: 'Expired', expires: '2026-06-30' }), nj({ status: 'Reinstatement Pending', expires: null })]);
    expect(result.outcome).toBe('review');
    expect(result.matches).toHaveLength(2);
  });

  it('reports an inactive license as needing review', () => {
    expect(one({}, [nj({ status: 'Inactive', expires: '2026-06-30' })]).outcome).toBe('review');
  });

  it('still calls two license holders in New Jersey with one name multiple matches', () => {
    expect(one({}, [nj({ number: '15BC1' }), nj({ number: '15BC2' })]).outcome).toBe('multiple');
  });
});

describe('licenses from more than one state', () => {
  const ri = (overrides) => license({ jurisdiction: 'RI', number: 'LBA1', status: 'Active', ...overrides });

  it('counts a state\'s "Active" as being in good standing, the way Massachusetts\' "Current" is', () => {
    expect(one({}, [ri()]).outcome).toBe('current');
    expect(one({}, [ri({ expires: '2026-10-01' })]).outcome).toBe('expiring');
    expect(one({}, [ri({ expires: '2026-09-01' })]).outcome).toBe('expired');
  });

  it('reports someone licensed in two states as licensed, listing both -- not as a name that cannot be told apart', () => {
    const result = one({}, [license({ number: 'LABA1' }), ri({ number: 'LBA9' })]);
    expect(result.outcome).toBe('current');
    expect(result.matches.map((m) => `${m.jurisdiction}:${m.number}`).sort()).toEqual(['MA:LABA1', 'RI:LBA9']);
  });

  it('still calls two different people with a name in the same state multiple matches', () => {
    expect(one({}, [ri({ number: 'LBA1' }), ri({ number: 'LBA2' })]).outcome).toBe('multiple');
    expect(one({}, [license({ number: 'LABA1' }), license({ number: 'LABA2' }), ri({ number: 'LBA9' })]).outcome).toBe('multiple');
  });

  it('is licensed if any state says so -- expired in one and current in the other', () => {
    expect(one({}, [license({ status: 'Expired', expires: '2020-12-31' }), ri()]).outcome).toBe('current');
  });
});

describe('the CentralReach people', () => {
  it('are read from a staff download, with who is active', () => {
    const { headers, rows } = parseCsv(
      [
        CONTACT_HEADER,
        contactRow({ Id: '10', FirstName: 'Ana', LastName: 'Lopez', ChosenName: 'Annie', Credentials: 'BCBA', IsActive: 'True' }),
        contactRow({ Id: '11', FirstName: 'Bo', LastName: 'Ng', IsActive: 'False' }),
      ].join('\n'),
    );
    expect(toStaffRecords({ headers, rows })).toEqual([
      { id: '10', firstName: 'Ana', lastName: 'Lopez', chosenName: 'Annie', credentials: 'BCBA', active: true },
      { id: '11', firstName: 'Bo', lastName: 'Ng', chosenName: '', credentials: '', active: false },
    ]);
  });
});

describe('finding a license by name', () => {
  it('is licensed when the name matches a current license', () => {
    const result = one({}, [license()]);
    expect(result.outcome).toBe('current');
    expect(result.matches[0]).toMatchObject({ number: 'LABA1', standing: 'current', daysLeft: daysUntil('2027-12-31', TODAY) });
    expect(result.staffName).toBe('Jane Doe');
  });

  it('does not care about case, accents, punctuation or stray spaces', () => {
    expect(one({ firstName: 'JOSÉ', lastName: "O'Brien" }, [license({ firstName: ' Jose ', lastName: 'OBRIEN ' })]).outcome).toBe('current');
  });

  it('also tries the name someone goes by', () => {
    expect(one({ firstName: 'Robert', chosenName: 'Bob', lastName: 'Ray' }, [license({ firstName: 'Bob', lastName: 'Ray' })]).outcome).toBe('current');
  });

  it('matches a first name plus middle name against a two-part first name', () => {
    expect(one({ firstName: 'Mary Ann', lastName: 'Doe' }, [license({ firstName: 'Mary', middleName: 'Ann' })]).outcome).toBe('current');
  });

  it('is not found when nothing matches, or when only a first or last name does', () => {
    expect(one({}, []).outcome).toBe('none');
    expect(one({}, [license({ firstName: 'Jane', lastName: 'Roe' })]).outcome).toBe('none');
    expect(one({}, [license({ firstName: 'John', lastName: 'Doe' })]).outcome).toBe('none');
  });

  it('gives every person a result, including one with no name to look up', () => {
    const results = matchLicenses([person(), person({ id: '2', firstName: '', lastName: '' })], [license()], TODAY);
    expect(results.map((r) => r.outcome)).toEqual(['current', 'none']);
  });
});

describe('how a license stands', () => {
  it('is expiring within 90 days -- and not at 91', () => {
    expect(one({}, [license({ expires: '2026-12-19' })]).outcome).toBe('expiring'); // exactly 90
    expect(one({}, [license({ expires: '2026-12-20' })]).outcome).toBe('current'); // 91
    expect(one({}, [license({ expires: TODAY })]).outcome).toBe('expiring'); // last day
  });

  it('is expired once the date has passed, even if the state still says Current', () => {
    expect(one({}, [license({ status: 'Current', expires: '2026-09-19' })]).outcome).toBe('expired');
    expect(one({}, [license({ status: 'Expired', expires: '2030-01-01' })]).outcome).toBe('expired');
  });

  it('needs review for anything the state says that is not simply current or expired', () => {
    for (const status of ['Suspension, Expired', 'Surrendered', 'Deceased', 'Non-Disciplinary Condition']) {
      expect(one({}, [license({ status })]).outcome).toBe('review');
    }
  });
});

describe('a name more than one license holder has', () => {
  const two = [license({ number: 'LABA1', status: 'Expired', expires: '2020-12-31' }), license({ number: 'LABA2', city: 'Salem' })];

  it('is reported as multiple matches, never quietly resolved to the one with a current license', () => {
    const result = one({}, two);
    expect(result.outcome).toBe('multiple');
    expect(result.matches.map((m) => m.number)).toEqual(['LABA2', 'LABA1']);
  });

  it('is not multiple when it is the same license twice', () => {
    expect(one({}, [license(), license()]).outcome).toBe('current');
  });
});

describe('a name that is close but not the same', () => {
  it('is a possible match for a nickname that starts the same way', () => {
    const result = one({ firstName: 'Alex' }, [license({ firstName: 'Alexander' })]);
    expect(result.outcome).toBe('possible');
    expect(result.matches[0].why).toBe('First names start alike');
  });

  it('is a possible match when the first name is the license\'s middle name', () => {
    const result = one({ firstName: 'Elizabeth' }, [license({ firstName: 'Mary', middleName: 'Elizabeth' })]);
    expect(result.outcome).toBe('possible');
    expect(result.matches[0].why).toMatch(/middle name/);
  });

  it('is a possible match for half of a compound last name', () => {
    const result = one({ lastName: 'Smith' }, [license({ lastName: 'Smith-Jones', firstName: 'Jane' })].map((l) => ({ ...l, firstName: 'Jane' })));
    expect(result.outcome).toBe('possible');
    expect(result.matches[0].why).toMatch(/compound last name/);
  });

  it('does not treat two-letter starts as the same name', () => {
    expect(one({ firstName: 'Al' }, [license({ firstName: 'Alan' })]).outcome).toBe('none');
  });

  it('prefers an exact match over any possible one', () => {
    const result = one({ firstName: 'Alex' }, [license({ number: 'A', firstName: 'Alexander' }), license({ number: 'B', firstName: 'Alex' })]);
    expect(result.outcome).toBe('current');
    expect(result.matches.map((m) => m.number)).toEqual(['B']);
  });
});

describe('the outcomes', () => {
  it('list every result the matcher can give, worst news first', () => {
    expect(OUTCOMES.map((o) => o.id)).toEqual(['expired', 'review', 'none', 'multiple', 'possible', 'expiring', 'current']);
  });
});
