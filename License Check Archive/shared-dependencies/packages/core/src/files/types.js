import { normalizeHeader, createColumnResolver } from '../csv/columns.js';

/**
 * What kind of export is this?
 *
 * Recognition is by column headers, never by file name -- CentralReach hands
 * out names like "420977d3f6d44233be970c435c224ad8.csv" and users rename them.
 *
 * `required` is the fingerprint: every one of these must be present for the
 * file to be that type. Keep it to columns that are both stable and unlikely
 * to appear together in a different export.
 *
 * `signature` is the full set of columns we expect to see. It is not used for
 * matching, only to notice drift -- if CentralReach adds or removes a column,
 * we say so rather than silently checking the wrong thing.
 *
 * `discriminator` exists because headers are not always enough. Clients and
 * staff are the same export with the same columns; only the contents differ.
 * Every column in a discriminator must match on every row, and a file whose
 * rows disagree is rejected rather than guessed at.
 *
 * `recordUrl` is the deep link back into CentralReach for one row, with {id}
 * standing in for that row's identifier. Each export knows its own URL shape;
 * checks only report which record they are talking about.
 *
 * A type with no `required` is one we know we will support but have not seen a
 * real export of yet. It appears nowhere in the UI until it can be detected.
 */

/** @typedef {{ id: string, title: string, icon: string, description: string, required?: string[], signature?: string[], discriminator?: Record<string,string>, recordUrl?: string }} FileType */

/** @type {FileType} */
export const codesFileType = {
  id: 'codes',
  title: 'Codes',
  titleLower: 'codes',
  icon: 'currency-dollar',
  description: 'The service code list, exported from CentralReach.',
  recordUrl: 'https://members.centralreach.com/#billingmanager/servicecodes/?serviceCode={id}',
  required: ['Id', 'CodeType', 'CodeTypeName', 'Code', 'Description', 'MinutesPerUnit'],
  signature: [
    'Id', 'CodeType', 'CodeTypeName', 'ProviderId', 'Code', 'Description',
    'MinutesPerUnit', 'DefaultMinutes', 'Modifier1', 'Modifier2', 'Modifier3', 'Modifier4',
    'EnforceLevel', 'EnforceLevelName', 'ServiceAddress', 'ServiceAddressName',
    'ServiceLocation', 'ServiceLocationName', 'ProcedureInfo', 'ProcedureInfoName',
    'DriveInfo', 'DriveInfoName', 'ServiceNote', 'ServiceNoteName', 'AdminNote', 'AdminNoteName',
    'DeletedBy', 'DeletedDate', 'ProviderSignature', 'ProviderSignatureName',
    'ClientSignature', 'ClientSignatureName', 'ClientSignatureLocation', 'ClientSignatureLocationName',
    'CalcType', 'CalcTypeName', 'CalcDefaultUnits', 'RequiresAuthorization', 'RequiresAuthorizationName',
    'EnforceSingleScheduleConversion', 'ShowClientRates', 'LockGracePeriod',
    'RequiresScheduleConversion', 'RestrictEarlyConversion', 'RestrictEarlyConversionEndTime',
    'numCustomRates', 'numDefaultRates', 'labels', 'DefaultPlaceOfService', 'NoteTemplates',
    'Service Type', 'Service Category',
  ],
};

/**
 * Clients and staff are one export with one set of columns. TypeId and Type
 * both say which, and both are checked: if a row's TypeId says one thing and
 * its Type says another, the file is rejected rather than trusted.
 */
const CONTACT_SIGNATURE = [
    'rn', 'Id', 'ImgProfile', 'Credentials', 'FirstName', 'LastName', 'PermissionId', 'Email',
    'LastLoginDate', 'GuardianFirstName', 'GuardianLastName', 'TypeId', 'IsActive',
    'LastDeactivatedOn', 'LastDeactivatedBy', 'LastReactivatedOn', 'LastReactivatedBy',
    'CreationDate', 'CreatedByContactId', 'CreatedByName', 'Type', 'Labels', 'AddressLine1',
    'AddressLine2', 'City', 'StateProvince', 'ZipPostalCode', 'Country', 'PhoneHome',
    'PhoneCell', 'PhoneWork', 'PhoneFax', 'HomeAddressLine1', 'HomeAddressLine2', 'HomeCity',
    'HomeStateProvince', 'HomeZipPostalCode', 'HomeCountry', 'HomePhoneHome', 'HomePhoneCell',
    'HomePhoneWork', 'PrimaryLocationId', 'PrimaryLocationName', 'BirthDate', 'Gender',
    'Principals', 'PrimaryInsuranceVerificationStatusCode', 'PrimaryInsuranceLastVerified',
    'SecondaryInsuranceVerificationStatusCode', 'SecondaryInsuranceLastVerified',
    'TertiaryInsuranceVerificationStatusCode', 'TertiaryInsuranceLastVerified',
    'GuarantorFirstName', 'GuarantorLastName', 'HireDate', 'TerminationDate',
    'AdditionalEmail', 'SSOConnectionStatus', 'ChosenName', 'ExternalSystemId',
    'SavedSignature', 'PrimaryCareRole', 'PrimaryCareRoleName', 'CaseLoadCount',
    'CareTeamCount', 'NpiNumber',
];

const CONTACT_REQUIRED = ['Id', 'TypeId', 'Type', 'FirstName', 'LastName', 'Credentials', 'BirthDate'];

/** @type {FileType} */
export const clientsFileType = {
  id: 'clients',
  title: '{Clients}',
  titleLower: '{clients}',
  icon: 'school',
  description: 'The {client} list, exported from CentralReach.',
  recordUrl: 'https://members.centralreach.com/#contacts/details/?id={id}&mode=profile&edit=basics',
  required: CONTACT_REQUIRED,
  signature: CONTACT_SIGNATURE,
  discriminator: { TypeId: '20', Type: 'client' },
};

/** @type {FileType} */
export const staffFileType = {
  id: 'staff',
  title: '{Staff}',
  titleLower: '{staff}',
  icon: 'id-badge-2',
  description: 'The {staff} list, exported from CentralReach.',
  recordUrl: 'https://members.centralreach.com/#contacts/details/?id={id}&mode=profile&edit=basics',
  required: CONTACT_REQUIRED,
  signature: CONTACT_SIGNATURE,
  discriminator: { TypeId: '572', Type: 'employee' },
};

const AUTHORIZATION_SIGNATURE = [
    'Id', 'ResourceId', 'ResourceHasAccess', 'IsActive', 'AllowOverBillHours',
    'AllowOverBillUnits', 'AllowOverBillAmount', 'AllowOverBillVisits',
    'AllowOverBillHoursTotal', 'AllowOverBillUnitsTotal', 'AllowOverBillAmountTotal',
    'AllowOverBillVisitsTotal', 'EnableValidation', 'AuthorizationNumber', 'TasksCompleted',
    'Tasks', 'NumTasksOverdue', 'NumTasksDayMatch', 'NumTasksWeekMatch', 'ServiceCodes',
    'FollowUpServiceCodes', 'FollowUpStartDate', 'FollowUpEndDate', 'FollowUpId',
    'FollowUpResourceId', 'FollowUpResourceHasAccess', 'FollowUpAuthorizationNumber',
    'clientId', 'clientName', 'ClientFullName', 'frequency', 'managerId', 'managerName',
    'implementerId', 'implementerName', 'PayorId', 'Payor', 'ActualStartDate', 'ActualEndDate',
    'AuthorizedHoursMonth', 'AuthorizedAmountMonth', 'AuthorizedUnitsMonth',
    'AuthorizedVisitsMonth', 'AuthorizedAmountAll', 'AuthorizedHoursAll', 'AuthorizedUnitsAll',
    'AuthorizedVisitsAll', 'WorkedVisitsMonth', 'WorkedUnitsMonth', 'WorkedAmountMonth',
    'WorkedAmountAgreedMonth', 'WorkedHoursMonth', 'WorkedVisitsAll', 'WorkedUnitsAll',
    'WorkedAmountAll', 'WorkedAmountAgreedAll', 'WorkedHoursAll', 'WorkedVisitsAuthRange',
    'WorkedUnitsAuthRange', 'WorkedAmountAuthRange', 'WorkedAmountAgreedAuthRange',
    'WorkedHoursAuthRange', 'ScheduledVisitsMonth', 'ScheduledHoursMonth',
    'ScheduledUnitsMonth', 'ScheduledVisitsMonthPending', 'ScheduledHoursMonthPending',
    'ScheduledUnitsMonthPending', 'ScheduledVisitsPendingAll', 'ScheduledHoursPendingAll',
    'ScheduledUnitsPendingAll', 'ScheduledVisitsPendingAuthRange',
    'ScheduledHoursPendingAuthRange', 'ScheduledUnitsPendingAuthRange', 'ScheduledAmountMonth',
    'ScheduledAmountAgreedMonth', 'ScheduledVisitsAll', 'ScheduledHoursAll',
    'ScheduledUnitsAll', 'ScheduledAmountAll', 'ScheduledAmountAgreedAll',
    'ScheduledVisitsAuthRange', 'ScheduledHoursAuthRange', 'ScheduledUnitsAuthRange',
    'ScheduledAmountAuthRange', 'ScheduledAmountAgreedAuthRange', 'ConvertedVisitsMonth',
    'ConvertedHoursMonth', 'ConvertedUnitsMonth', 'ConvertedAmountMonth',
    'ConvertedAmountAgreedMonth', 'ConvertedVisitsAll', 'ConvertedHoursAll',
    'ConvertedUnitsAll', 'ConvertedAmountAll', 'ConvertedAmountAgreedAll',
    'ConvertedVisitsAuthRange', 'ConvertedHoursAuthRange', 'ConvertedUnitsAuthRange',
    'ConvertedAmountAuthRange', 'ConvertedAmountAgreedAuthRange', 'startDate', 'endDate',
    'PendingAmountAll', 'PendingAmountAgreedAll', 'PendingVisitsAll', 'PendingHoursAll',
    'PendingUnitsAll', 'PendingAmountMonth', 'PendingAmountAgreedMonth', 'PendingVisitsMonth',
    'PendingHoursMonth', 'PendingUnitsMonth', 'PendingAmountAuthRange',
    'PendingAmountAgreedAuthRange', 'PendingVisitsAuthRange', 'PendingHoursAuthRange',
    'PendingUnitsAuthRange', 'RemainingAmountAll', 'RemainingAmountAgreedAll',
    'RemainingVisitsAll', 'RemainingHoursAll', 'RemainingUnitsAll', 'RemainingAmountMonth',
    'RemainingAmountAgreedMonth', 'RemainingVisitsMonth', 'RemainingHoursMonth',
    'RemainingUnitsMonth', 'RemainingAmountAuthRange', 'RemainingAmountAgreedAuthRange',
    'RemainingVisitsAuthRange', 'RemainingHoursAuthRange', 'RemainingUnitsAuthRange',
    'UtilizationAmountAll', 'UtilizationAmountAgreedAll', 'UtilizationVisitsAll',
    'UtilizationHoursAll', 'UtilizationUnitsAll', 'UtilizationAmountMonth',
    'UtilizationAmountAgreedMonth', 'UtilizationVisitsMonth', 'UtilizationHoursMonth',
    'UtilizationUnitsMonth', 'UtilizationAmountAuthRange', 'UtilizationAmountAgreedAuthRange',
    'UtilizationVisitsAuthRange', 'UtilizationHoursAuthRange', 'UtilizationUnitsAuthRange',
    'ClientLabels', 'WorkWeek', 'ClientAcceptedHours', 'ClientAcceptedHoursFrequency',
];

/** @type {FileType} */
export const authorizationsFileType = {
  id: 'authorizations',
  title: 'Authorizations',
  titleLower: 'authorizations',
  icon: 'file-description',
  description: '{Client} authorizations, exported from CentralReach.',
  recordUrl: 'https://members.centralreach.com/#resources/details/?id={id}',
  required: [
    'Id', 'AuthorizationNumber', 'AllowOverBillUnitsTotal', 'clientId', 'PayorId',
    'AuthorizedUnitsAll', 'startDate', 'endDate',
  ],
  signature: AUTHORIZATION_SIGNATURE,
};

const PAYOR_SIGNATURE = [
    'ClientId', 'FirstName', 'LastName', 'PayorType', 'Type', 'InsuranceCompany', 'InsurancePlan',
    'PayerAddress', 'Copay', 'CopayFrequency', 'From', 'To', 'InsuranceContactPhone',
    'InsuranceContactName', 'Status', 'Shared', 'OverviewLabel', 'OverviewNotes', 'SubscriberLastName',
    'SubscriberFirstName', 'SubscriberDOB', 'SubscriberGender', 'PolicyGroupFECA', 'PolicyGroupName',
    'SubscriberInsuredId', 'SubscriberAddressLine1', 'SubscriberAddressLine2', 'SubscriberCity',
    'SubscriberState', 'SubscriberZip', 'PatientLastName', 'PatientFirstName', 'RelationshipType',
    'PatientInsuredId', 'PatientGender', 'PatientDOB', 'PatientAddressLine1', 'PatientAddressLine2',
    'PatientCity', 'PatientState', 'PatientZip', 'CCType', 'CCExpMo', 'CCExpYear', 'CCLastFour',
    'PayerId', 'GenericPayerId', 'ZirmedPayerId', 'Active', 'ContactLabels', 'ChangeHealthPayerId',
    'ClientPayorID',
];

/**
 * A {client}'s insurance, one row per payor they are set up with.
 *
 * Only four of its columns appear in any other export at all -- ClientId,
 * FirstName, LastName and Type -- and the fingerprint below deliberately uses
 * none of them. Every column in it belongs to this export and no other, so
 * there is nothing for it to be confused with and nothing for a future export
 * to collide with either.
 *
 * The link goes to the {client}, since a payor row has no page of its own that
 * we know the address of. It lands on their profile rather than their insurance
 * tab; if that tab has an address, this is the one line that changes.
 *
 * @type {FileType}
 */
export const payorsFileType = {
  id: 'payors',
  title: 'Payors',
  titleLower: 'payors',
  icon: 'building-bank',
  description: '{Client} insurance and payor details, exported from CentralReach.',
  recordUrl: 'https://members.centralreach.com/#contacts/details/?id={id}&mode=profile&edit=basics',
  required: [
    'PayorType', 'InsuranceCompany', 'InsurancePlan',
    'SubscriberInsuredId', 'PayerId', 'ClientPayorID',
  ],
  signature: PAYOR_SIGNATURE,
};

const BILLING_SIGNATURE = [
  'Id', 'GroupId', 'GroupCount', 'CreationDate', 'DateOfService', 'TimeWorkedFrom', 'TimeWorkedTo',
  'TimeWorkedInHours', 'TimeWorkedInMins', 'ClientId', 'ClientFirstName', 'ClientLastName',
  'ClientLocationId', 'ClientLocationName', 'ClientLocationAddressLine1', 'ClientLocationAddressLine2',
  'ClientLocationCity', 'ClientLocationStateProvince', 'ClientLocationZipPostalCode',
  'ClientLocationCountry', 'ClientContactLabels', 'ProviderId', 'ProviderFirstName', 'ProviderLastName',
  'ProviderLocationId', 'ProviderLocationName', 'ProviderLocationAddressLine1',
  'ProviderLocationAddressLine2', 'ProviderLocationCity', 'ProviderLocationStateProvince',
  'ProviderLocationZipPostalCode', 'ProviderLocationCountry', 'ProviderContactLabels',
  'AuthorizationId', 'AuthorizationResourceId', 'ProcedureCodeId', 'ProcedureCode',
  'ProcedureCodeDescription', 'CodeLabels', 'LocationCode', 'LocationDescription',
  'ServiceLocationName', 'ServiceLocationAddressLine1', 'ServiceLocationAddressLine2',
  'ServiceLocationCity', 'ServiceLocationStateProvince', 'ServiceLocationZipPostalCode',
  'ServiceLocationCountry', 'DiagnosisCode1', 'DiagnosisCode2', 'DiagnosisCode3', 'DiagnosisCode4',
  'DiagnosisCode5', 'DiagnosisCode6', 'DiagnosisCode7', 'DiagnosisCode8', 'DiagnosisCode9',
  'DiagnosisCode10', 'DiagnosisCode11', 'DiagnosisCode12', 'Modifier1', 'Modifier2', 'Modifier3',
  'Modifier4', 'CalcType', 'UnitsOfService', 'DriveTimeInMinutes', 'Mileage', 'BillingLabels',
  'ResourceCount', 'ContactPayorId', 'PayorCompanyId', 'PayorPlanId', 'PayorName', 'FeeSchedule',
  'FirstPrimaryInsuranceOnFile', 'FirstSecondaryInsuranceOnFile', 'FirstTertiaryInsuranceOnFile',
  'RateClient', 'RateClientAgreed', 'RateClientDriveHourly', 'RateClientDriveMileage', 'RateProvider',
  'RateProviderDriveHourly', 'RateProviderDriveMileage', 'Invoiced', 'PaymentsMade', 'Exported',
  'Claims', 'ClaimsExported', 'ClientCharges', 'ClientAgreedCharges', 'DriveTimeCharges',
  'MileageCharges', 'ClientChargesTotal', 'ClientChargesAgreedTotal', 'CalcAdjustment', 'AmountOwed',
  'AmountAgreedOwed', 'AmountPaid', 'AmountAdjustment', 'CopayAmount', 'CopayPaid', 'CopayOwed',
  'IsLocked', 'IsVoid', 'VoidedDate', 'IsDeleted', 'DeletedDate', 'SignedByProvider', 'SignedByClient',
  'Tasks', 'TasksCompleted', 'LastPaid', 'LastBilled', 'FirstBillDate', 'DOS_Aging', 'DOS_0_30',
  'DOS_0_30_Copay', 'DOS_31_60', 'DOS_31_60_Copay', 'DOS_61_90', 'DOS_61_90_Copay', 'DOS_91_120',
  'DOS_91_120_Copay', 'DOS_gt_120', 'DOS_gt_120_Copay', 'NegClientChargesTotal', 'NegAmountOwed',
  'Neg_0_30', 'Neg_0_30_Copay', 'Neg_31_60', 'Neg_31_60_Copay', 'Neg_61_90', 'Neg_61_90_Copay',
  'Neg_91_120', 'Neg_91_120_Copay', 'Neg_gt_120', 'Neg_gt_120_Copay', 'FB_Aging', 'FB_0_30',
  'FB_0_30_Copay', 'FB_31_60', 'FB_31_60_Copay', 'FB_61_90', 'FB_61_90_Copay', 'FB_91_120',
  'FB_91_120_Copay', 'FB_gt_120', 'FB_gt_120_copay', 'FBNeg_0_30', 'FBNeg_0_30_Copay', 'FBNeg_31_60',
  'FBNeg_31_60_Copay', 'FBNeg_61_90', 'FBNeg_61_90_Copay', 'FBNeg_91_120', 'FBNeg_91_120_Copay',
  'FBNeg_gt_120', 'FBNeg_gt_120_copay', 'FirstClaimId', 'FirstClaimDate', 'LastClaimId',
  'LastClaimDate', 'FirstInvoiceId', 'FirstInvoiceDate', 'LastInvoiceId', 'LastInvoiceDate',
  'FirstActivityStatementId', 'FirstActivityStatementDate', 'LastActivityStatementId',
  'LastActivityStatementDate', 'FirstCopayInvoiceId', 'FirstCopayInvoiceDate', 'LastCopayInvoiceId',
  'LastCopayInvoiceDate', 'OrganizationId', 'PayorNickname', 'Timezone', 'TimeWorkedFromUtcOffset',
  'TimeZoneAbbr',
];

/**
 * The billing export: one row per billed (and non-billable) activity entry.
 * This is CentralReach's full billing detail download -- the same family as
 * the AR export (see ar/columns.js), but unfiltered and per-service-line
 * rather than one row per balance -- so its fingerprint is deliberately
 * columns the AR export does not carry (ProcedureCodeId, TimeWorkedInHours,
 * DOS_Aging) rather than the ones the two exports share (PayorName, ClientId).
 *
 * @type {FileType}
 */
export const billingFileType = {
  id: 'billing',
  title: 'Billing',
  titleLower: 'billing',
  icon: 'receipt-2',
  description: 'The billing download, exported from CentralReach.',
  recordUrl: 'https://members.centralreach.com/#billing/details/?id={id}',
  required: [
    'Id', 'GroupId', 'DateOfService', 'TimeWorkedInHours', 'ProcedureCodeId', 'ClientChargesTotal',
    'DOS_Aging',
  ],
  signature: BILLING_SIGNATURE,
};

/** Order here is the order sections appear in the report. */
export const fileTypes = [
  codesFileType,
  authorizationsFileType,
  payorsFileType,
  clientsFileType,
  staffFileType,
  billingFileType,
];

/** Only types we can actually fingerprint can be detected. */
const detectable = () => fileTypes.filter((type) => Array.isArray(type.required));

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * Identify a file from its headers and, where headers alone cannot tell, its
 * contents.
 *
 * @param {string[]} headers
 * @param {Object[]} [rows]
 * @returns {{ fileType: Object|null, problem: string|null }}
 *   `fileType` null with `problem` null means we simply do not recognize it.
 *   `problem` set means we recognized the shape but will not use the file, and
 *   the string says why in the words the user needs to hear.
 */
export function identifyFile(headers, rows = []) {
  const present = new Set(headers.map(normalizeHeader));

  const candidates = detectable()
    .filter((type) => type.required.every((column) => present.has(normalizeHeader(column))))
    // If two types ever both fit on headers alone, the more specific wins.
    .sort((a, b) => b.required.length - a.required.length);

  if (candidates.length === 0) return { fileType: null, problem: null };

  const undivided = candidates.find((type) => !type.discriminator);
  if (undivided) return { fileType: describe(undivided, headers), problem: null };

  return resolveByContents(candidates, headers, rows);
}

/** Decide between types that share their columns by reading every row. */
function resolveByContents(candidates, headers, rows) {
  if (rows.length === 0) {
    const names = candidates.map((c) => c.title).join(' or ');
    return { fileType: null, problem: `This file has no rows, so we can't tell ${names} apart.` };
  }

  const { resolve } = createColumnResolver(headers);
  const counts = new Map(candidates.map((type) => [type.id, 0]));
  const disagreed = [];
  let neither = 0;

  rows.forEach((row, index) => {
    const full = candidates.filter((type) =>
      Object.entries(type.discriminator).every(([column, value]) =>
        same(row[resolve(column)], value),
      ),
    );

    if (full.length === 1) {
      counts.set(full[0].id, counts.get(full[0].id) + 1);
      return;
    }

    // Belt and suspenders: one column says clients, the other says staff.
    const partial = candidates.some((type) =>
      Object.entries(type.discriminator).some(([column, value]) =>
        same(row[resolve(column)], value),
      ),
    );
    if (partial) disagreed.push(index + 2);
    else neither += 1;
  });

  const found = candidates.filter((type) => counts.get(type.id) > 0);

  if (found.length > 1) {
    const parts = found.map((type) => `${counts.get(type.id).toLocaleString()} ${type.titleLower}`);
    return {
      fileType: null,
      problem: `This file is a mix of ${parts.join(' and ')}. Export them separately and upload each on its own.`,
    };
  }

  if (disagreed.length > 0) {
    const where = disagreed.slice(0, 3).join(', ');
    const more = disagreed.length > 3 ? `, and ${disagreed.length - 3} more` : '';
    return {
      fileType: null,
      problem: `TypeId and Type disagree on row ${where}${more}. We won't guess which one is right.`,
    };
  }

  if (found.length === 0 || neither > 0) {
    const names = candidates.map((c) => `${c.titleLower} (${Object.values(c.discriminator).join(' / ')})`);
    return {
      fileType: null,
      problem: `${(neither || rows.length).toLocaleString()} row${(neither || rows.length) === 1 ? ' is' : 's are'} neither ${names.join(' nor ')}.`,
    };
  }

  return { fileType: describe(found[0], headers), problem: null };
}

function describe(type, headers) {
  const present = new Set(headers.map(normalizeHeader));
  const expected = new Set(type.signature.map(normalizeHeader));
  return {
    id: type.id,
    title: type.title,
    titleLower: type.titleLower,
    icon: type.icon,
    description: type.description,
    missingColumns: type.signature.filter((column) => !present.has(normalizeHeader(column))),
    unexpectedColumns: headers.filter((header) => !expected.has(normalizeHeader(header))),
  };
}

export function getFileType(id) {
  return fileTypes.find((type) => type.id === id) ?? null;
}

/** Portal- and IPC-safe description of every type we know about. */
export function describeFileTypes() {
  return fileTypes.map(({ id, title, titleLower, icon, description, required }) => ({
    id,
    title,
    titleLower,
    icon,
    description,
    detectable: Array.isArray(required),
  }));
}
