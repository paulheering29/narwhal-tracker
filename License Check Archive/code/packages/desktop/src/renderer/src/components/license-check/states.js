import { VT_SITE_URL, PA_SITE_URL, waExtractUrl, txExtractUrl, ilExtractUrl, ctExtractUrl } from '@sysreview/core';

/**
 * The states License Check can read: what to call each, where its list comes
 * from, and how to get it by hand if the button cannot.
 */
export const STATES = [
  {
    code: 'MA',
    name: 'Massachusetts',
    site: 'https://checkahealthlicense.mass.gov/',
    siteLabel: 'license site',
    what: "Downloads the state's public Licensed Applied Behavior Analyst lists (and the Assistant one).",
    byHand:
      'choose Download License Data, open Board of Registration of Allied Mental Health and Human Services Professions, and download Licensed Applied Behavior Analyst License -- and the Assistant one too if you have any. Drop the ZIP here as it downloads; there is no need to open it.',
  },
  {
    code: 'RI',
    name: 'Rhode Island',
    site: 'https://health.ri.gov/licensing/licensee-lists',
    siteLabel: 'Licensee Lists page',
    what: "Downloads the state's public list of Applied Behavior Analysts. Rhode Island lists active licenses only.",
    byHand:
      'choose Applied Behavior Analyst, press Search, then Download. Drop the CSV here. (The whole-state file works too; everything but behavior analysts is ignored.)',
  },
  {
    code: 'NJ',
    name: 'New Jersey',
    site: 'https://newjersey.mylicense.com/Verification_Bulk/',
    siteLabel: 'bulk download page',
    what: "Downloads the state's public list of Applied Behavior Analysts and Assistants, including people whose application is still Pending. Takes a few seconds.",
    byHand:
      'choose Person Download Search, set Profession to Applied Behavior Analysts, press Search, then Download List, Continue and Download. Drop the file it gives you (it is called Data.txt) here.',
  },
  {
    code: 'AZ',
    name: 'Arizona',
    site: 'https://abpe.portalus.thentiacloud.net/webs/portal/register/',
    siteLabel: 'public registry',
    // The state's site turns away anything that is not a web browser, so there is nothing to press here.
    fetchable: false,
    what: "Arizona's registry only gives its list to a web browser, so it has to be downloaded by hand.",
    byHand:
      'set License Type to Behavior Analyst, press Search, then Download (.csv). Drop the file it gives you (it is called Export.csv) here.',
  },
  {
    code: 'WA',
    name: 'Washington',
    site: waExtractUrl(),
    siteLabel: 'behavior analyst list',
    what: "Downloads the state's public list of Licensed Behavior Analysts and Assistants, including people whose application is still Pending.",
    byHand: 'open this address; your browser saves the list as a CSV (or shows it -- save what it shows as a .csv file). Drop the file here.',
  },
  {
    code: 'TX',
    name: 'Texas',
    site: txExtractUrl(),
    siteLabel: 'behavior analyst list',
    what: "Downloads the state's public list of Licensed Behavior Analysts and Assistants (about 10,000 people). Texas publishes an expiry date for each but no status.",
    byHand: 'open this address; your browser saves the list as a CSV (or shows it -- save what it shows as a .csv file). Drop the file here.',
  },
  {
    code: 'IL',
    name: 'Illinois',
    site: ilExtractUrl(),
    siteLabel: 'behavior analyst list',
    what: "Downloads the state's public list of Licensed Behavioral Analysts and Assistants. Illinois lists almost only active licenses.",
    byHand: 'open this address; your browser saves the list as a CSV (or shows it -- save what it shows as a .csv file). Drop the file here.',
  },
  {
    code: 'CT',
    name: 'Connecticut',
    site: ctExtractUrl(),
    siteLabel: 'behavior analyst list',
    what: "Downloads the state's public list of behavior analysts, including people whose application is Pending.",
    byHand: 'open this address; your browser saves the list as a CSV (or shows it -- save what it shows as a .csv file). Drop the file here.',
  },
  {
    code: 'VT',
    name: 'Vermont',
    site: VT_SITE_URL,
    siteLabel: 'Find a Professional page',
    what: "Gets the state's Applied and Assistant Behavior Analyst rosters from the Office of Professional Regulation, expiry dates included. Takes under a minute.",
    // The state's roster is an Excel file for one license type at a time, made from a chain of page choices, so there is no one download to describe.
    byHand: '',
  },
  {
    code: 'PA',
    name: 'Pennsylvania',
    site: PA_SITE_URL,
    siteLabel: 'license search',
    what: 'Gets the state\'s Behavior Specialists (its name for behavior analysts) from its public license search, a page at a time. Takes about a minute. Pennsylvania publishes a status but no expiry date.',
    // The search shows people a page at a time and has no download, so there is no by-hand version to describe.
    byHand: '',
  },
  {
    code: 'OH',
    name: 'Ohio',
    site: 'https://elicense.ohio.gov/oh_verifylicense',
    siteLabel: 'license search',
    // Its search hands each visitor codes that only their own browser can get, so the app cannot start the search itself.
    fetchable: false,
    pasteRequest: true,
    what: "Ohio's search only answers a request copied from your own browser, so it takes a few extra steps.",
    byHand: '',
  },
];
