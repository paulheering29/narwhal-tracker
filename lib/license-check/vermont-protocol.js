// Vermont's roster download, request by request. Copied verbatim from the
// desktop License Check, where it was tested against the live site: the Pega
// page is fragile and every detail below was found by comparing what the page
// sends with what a script sent, so it is deliberately not rewritten.

/**
 * Vermont's Behavior Analysts, from the Office of Professional Regulation's
 * "Profession Roster Download".
 *
 * Vermont licenses Applied Behavior Analysts and Assistant Behavior Analysts,
 * and its site lets anyone download a roster of a profession -- with expiry
 * dates -- as an Excel file, no login and no CAPTCHA. But the site is a Pega
 * application: there is no URL for the file, only a chain of page actions that
 * leave the choices (profession, statuses, type) on the server, after which one
 * more address hands over a spreadsheet of them. This file is that chain, as
 * plain request bodies, so the network part can stay a few lines.
 *
 * Things that decide the shape of it, all found by comparing what the page
 * sends with what a script sent until the two files matched:
 * - **Every action carries a token the page issued** (`pzuiactionzzz`), and each
 *   choice needs its own: the profession list belongs to the *lookup* section,
 *   the statuses to the status section, the type to the roster section.
 * - **A ticked status is not counted until the checkbox's own follow-up runs**
 *   (`SetRosterDownloadStatuses`): the tick is sent, then that section is
 *   refreshed. Without it the spreadsheet comes back with only its headers.
 * - **The spreadsheet is made when Download is pressed**, from whatever type is
 *   chosen then. So one session can take every type in turn.
 * - The tokens are found by what their action *does*, not by the rule ids around
 *   them, so a change of ids on the state's side does not break the reading.
 */

export const VT_HOST = 'secure.professionals.vermont.gov';
export const VT_START_URL = `https://${VT_HOST}/prweb/PRServletCustom?UserIdentifier=LicenseLookupGuestUser`;
export const VT_SITE_URL = `https://${VT_HOST}/`;
/** The site's own code for the "Behavior Analysts" profession. */
export const VT_PROFESSION = 'PC038';
export const VT_STATUS_COUNT = 4; // Active, Inactive per Request, Expired, Disciplined -- all of them are asked for

/** Every type the profession offers. Each roster is one type, and does not say which. */
export const VT_LICENSE_TYPES = [
  { id: 'NGLP146', name: 'Applied Behavior Analyst' },
  { id: 'NGLP147', name: 'Assistant Behavior Analyst' },
  { id: 'NGLP146-PROV', name: 'Applied Behavior Analyst - Provisional' },
  { id: 'NGLP147-PROV', name: 'Assistant Behavior Analyst - Provisional' },
  { id: 'NGLP146-EMGY', name: 'Applied Behavior Analyst - Emergency Temporary License' },
  { id: 'NGLP147-EMGY', name: 'Assistant Behavior Analyst - Emergency Temporary License' },
  { id: 'NGLP146-TELE', name: 'Applied Behavior Analyst - Interim Telehealth Registration' },
  { id: 'NGLP147-TELE', name: 'Assistant Behavior Analyst - Interim Telehealth Registration' },
  { id: 'NGLP146-FCTY', name: 'Applied Behavior Analyst - Facility Staff/Inactive Registration' },
  { id: 'NGLP147-FCTY', name: 'Assistant Behavior Analyst - Facility Staff/Inactive Registration' },
];

/** What the page's own script says about itself; a script that says nothing is not one the server minds. */
export const VT_BROWSER_HEADERS = { 'X-Requested-With': 'XMLHttpRequest', pzBFP: '{v2}0' };

const PROP = '$PpyDisplayHarness$p';
const LOOKUP_FIELDS = ['LookupNumber', 'FirstName', 'LastName', 'BusinessEntity$pTradeName', 'LicenseLookupVal'].map((name) => `${PROP}${name}=`).join('&');
const RESULT_WIDTHS =
  'D_LicenseLookupResultsPpxResults1colWidthGBL=&D_LicenseLookupResultsPpxResults1colWidthGBR=&D_LicenseLookupResultsBusinessPpxResults1colWidthGBL=&D_LicenseLookupResultsBusinessPpxResults1colWidthGBR=';
// The list of scripts and styles the page already has, sent back empty so the server does not send them again.
const STATIC_INCLUDES =
  '$ODesktopWrapperInclude=&$ODeterminePortalTop=&$ODynamicLayout=&$ODynamicLayoutCell=&$OEvalDOMScripts_Include=&$OGridInc=&$OHarnessStaticJSEnd=&$OHarnessStaticJSStart=&$OHarnessStaticScriptsClientValidation=&$OMobileAppNotify=&$OPMCHarnessStaticScripts=&$ORepeatingDynamicLayout=&$OSessionUser=&$OSurveyStaticScripts=&$OWorkformStyles=&$OpxButton=&$OpxDisplayText=&$OpxDropdown=&$OpxHidden=&$OpxIcon=&$OpxLayoutContainer=&$OpxLayoutHeader=&$OpxLink=&$OpxMenu=&$OpxNonTemplate=&$OpxSection=&$OpxTextInput=&$OpxVisible=&$OpyWorkFormStandardEnd=&$OpyWorkFormStandardStart=&$OpzDecimalInclude=&$OpzHarnessInlineScriptsEnd=&$OpzHarnessInlineScriptsStart=&$OpzRuntimeToolsBar=&$Opzpega_ui_harnesscontext=&$Ordlincludes=&$Ouiautomationscripts=&$OpxCheckbox=';
const STATIC_INCLUDES_NO_CHECKBOX = STATIC_INCLUDES.replace('&$OpxCheckbox=', '');

const encode = (value) => encodeURIComponent(value);

/** The page's text with the JSON escapes in its action strings undone, so an action can be read. */
const unescapeActions = (html) => html.replaceAll('\\u003d', '=').replaceAll('\\u0027', "'").replaceAll('\\u0026amp;', '&').replaceAll('\\u0026', '&');

/**
 * What the first page says about the session it started.
 *
 * @param {string} html
 * @param {string} url  Where the page finally came from.
 */
export function readVtStart(html, url) {
  const csrf = html.match(/"activeCSRFToken":\s*"([0-9a-f]+)"/)?.[1];
  const transactionId = html.match(/pzTransactionId=([0-9a-f]{32})/)?.[1];
  const harnessId = html.match(/(HID[0-9A-F]{32})/)?.[1];
  if (!csrf || !transactionId || !harnessId) return null;

  // Each section the page is built of has an instance id, which its own refreshes name.
  const sections = {};
  const sectionPattern = /\\?"section\\?":\\?"(\w+)\\?",\\?"class\\?":\\?"[\w-]+\\?"(?:,\\?"RO\\?":\\?"\w+\\?")?,\\?"UID\\?":\\?"(SID\d+)/g;
  for (const match of html.matchAll(sectionPattern)) sections[match[1]] ??= match[2];

  return { base: url.split('?')[0], csrf, transactionId, harnessId, sections, actions: readVtActions(html) };
}

/** Every click or change action in a page, with the token it carries. */
function actionStrings(html) {
  const text = unescapeActions(html);
  const found = [];
  for (const match of text.matchAll(/" data-(click|change)='(.*?)' "/g)) {
    const token = match[2].match(/pzuiactionzzz=([A-Za-z0-9%*=_+/-]+)/)?.[1];
    if (token) found.push({ kind: match[1], action: match[2].replaceAll('\\"', '"'), token });
  }
  return found;
}

/**
 * The tokens the roster steps need, found by what each action does. `tab` is the
 * "Profession Roster Download" button; `statuses` the follow-up to a ticked
 * status; `download` the Download button, whose action also names the address
 * the spreadsheet is fetched from.
 */
export function readVtActions(html) {
  const all = actionStrings(html);
  const tab = all.find((a) => a.kind === 'click' && a.action.includes('"LookupType":"Roster+Download"'))?.token;
  const statuses = all.find((a) => a.kind === 'change' && a.action.includes('SetRosterDownloadStatuses'))?.token;
  const downloadAction = all.find((a) => a.kind === 'click' && a.action.includes('SetRosterDownloadApplicant'));
  const spreadsheet = downloadAction?.action.match(/openUrlInWindow", \["([^"]*pzProcessURLInWindow[^"]*)"/)?.[1];
  return { tab, statuses, download: downloadAction?.token, spreadsheetPath: spreadsheet?.replace('@', '%40') };
}

/**
 * The tokens for posting a chosen value, one per section, from the page that
 * showed the roster. (Its profession list is in the lookup section, its ticks
 * in the status section, its types in the roster section.)
 */
export function readVtValueTokens(html) {
  const tokens = {};
  for (const match of html.matchAll(/secPostValueURL":"pzuiactionzzz\\u003d([^"]+)"/g)) {
    const section = [...html.slice(0, match.index).matchAll(/\\?"section\\?":\\?"(\w+)/g)].pop()?.[1];
    if (section) tokens[section] ??= match[1];
  }
  return { profession: tokens.NGLPLicenseLookupInput, status: tokens.NGLPRosterDownloadStatusSelect, type: tokens.NGLPRosterDownload };
}

const requestUrl = (session, extra = '') =>
  `${session.base}?pzTransactionId=${session.transactionId}&pzFromFrame=pyDisplayHarness&pzPrimaryPageName=pyDisplayHarness&AJAXTrackID=1${extra}`;

const tail = (session, stream) =>
  `PreActivityContextPageList=%24NULL%24&pzKeepPageMessages=false&strPHarnessClass=SoV-License-NGLP-Work-License&strPHarnessPurpose=NGLPFindAProfessionalExternal&BaseReference=&StreamList=${encode(stream)}&bClientValidation=true&HeaderButtonSectionName=-1&ReadOnly=-1&PagesToRemove=&pzHarnessID=${session.harnessId}&inStandardsMode=true`;

const section = (session, name) => `${name}|Rule-HTML-Section||||Y|${session.sections[name] ?? 'SID1'}|:`;

/** Press "Profession Roster Download". */
export function vtTabRequest(session) {
  const eventSource = 'SoV-License-NGLP-Work-License.FindAProfessionalInput';
  return {
    url: requestUrl(session, `&eventSrcSection=${eventSource}`),
    body: `${LOOKUP_FIELDS}&${RESULT_WIDTHS}&${PROP}ProductIds=&${PROP}SetProfessionType=&pzuiactionzzz=${session.actions.tab}&SectionIDList=GID_1%3AGID_2%3A&PreActivitiesList=&ActivityParams=%3D&${STATIC_INCLUDES_NO_CHECKBOX}&${tail(session, section(session, 'FindAProfessionalWrapper'))}&eventSrcSection=${eventSource}`,
  };
}

/**
 * Choose a value in a list or tick a box. The token has a "=" after it, as the
 * page's own script writes it; a list is sent as a fresh render and a box not.
 */
export function vtChoiceRequest(session, { property, value, token, baseReference = '', fresh = true }) {
  const flags = fresh ? 'UITemplatingStatus=Y&PVClientVal=true' : 'PVClientVal=true&UITemplatingStatus=N';
  return {
    url: requestUrl(session),
    body: `${PROP}${property}=${encode(value)}&${STATIC_INCLUDES}&pzuiactionzzz=${token}=&pyPropertyTarget=${encode(`${PROP}${property}`)}&updateDOM=true&BaseReference=${encode(baseReference)}&ContextPage=&pzKeepPageMessages=true&${flags}&inStandardsMode=true&pzHarnessID=${session.harnessId}`,
  };
}

/** Tick the nth status (1 to VT_STATUS_COUNT). */
export function vtTickRequest(session, tokens, nth) {
  return vtChoiceRequest(session, {
    property: `EligibleStatusforRoster$l${nth}$pSelectStatus`,
    value: 'true',
    token: tokens.status,
    baseReference: `pyDisplayHarness.EligibleStatusforRoster(${nth})`,
    fresh: false,
  });
}

/** What the page does after a box is ticked: send the form, and refresh its input section. */
export function vtStatusRefreshRequest(session, ticked) {
  const flags = Array.from({ length: VT_STATUS_COUNT }, (_, i) => `${PROP}EligibleStatusforRoster$l${i + 1}$pSelectStatus=${i < ticked}`).join('&');
  return {
    url: requestUrl(session),
    body: `${LOOKUP_FIELDS}&${flags}&${RESULT_WIDTHS}&${PROP}ProductIds=${VT_PROFESSION}&${PROP}SetProfessionType=&pzuiactionzzz=${session.actions.statuses}&SectionIDList=GID_3%3AGID_4%3A&PreActivitiesList=&ActivityParams=%3D&${STATIC_INCLUDES}&${tail(session, section(session, 'FindAProfessionalInput'))}`,
  };
}

/** Press Download. The spreadsheet is made now, from the type chosen. */
export function vtDownloadRequest(session) {
  return {
    url: requestUrl(session),
    body: `pzuiactionzzz=${session.actions.download}&PreActivitiesList=&ActivityParams=%3D&${STATIC_INCLUDES}&${tail(session, 'NGLPRosterDownloadResults|Rule-HTML-Section||||Y|SID1|:')}`,
  };
}

/** Where the spreadsheet made by the last Download is fetched from. */
export function vtSpreadsheetUrl(session) {
  return new URL(`${session.actions.spreadsheetPath}&target=popup&pzHarnessID=${session.harnessId}`, session.base).href;
}

/** The columns a sweep is written as -- and read back from. No street addresses, and no supervisors or employers. */
export const VT_CSV_HEADERS = ['License Number', 'License Type', 'Status', 'First Name', 'Middle Name', 'Last Name', 'City', 'State', 'Expires'];

/** One line of a roster as a row of VT_CSV_HEADERS; `typeName` is the type it was downloaded as. */
export function vtRow(line, typeName) {
  const text = (value) => String(value ?? '').trim();
  return {
    'License Number': text(line.LicenseNumber),
    'License Type': typeName,
    Status: text(line.Status),
    'First Name': text(line['First Name']),
    'Middle Name': text(line['Middle Name']),
    'Last Name': text(line['Last Name']),
    City: text(line.City),
    State: text(line.State),
    Expires: text(line['License Expiration']),
  };
}
