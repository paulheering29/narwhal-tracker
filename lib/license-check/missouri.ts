import { parseCsv, toIsoDate } from './csv'
import type { StateLicense } from './types'

// Missouri's Division of Professional Registration offers "Downloadable Listings" behind a
// CAPTCHA. Each is a tab-delimited text file (BAN.TXT for behavior analysts, with a
// FILEDESC.TXT describing the columns) of CURRENTLY licensed people only: every row is
// Active and not expired, so a lapsed license is simply absent. It has no license type
// column (the profession code is "BAN") and no date for when it was made.
const REQUIRED = ['lic_number', 'prc_first_name', 'prc_last_name', 'lst_description', 'lic_exp_date']

/** @throws if the text isn't Missouri's listing. */
export function readMissouriList(text: string): StateLicense[] {
  const { headers, rows } = parseCsv(text, '\t')
  if (!REQUIRED.every(c => headers.includes(c))) {
    throw new Error("That doesn't look like a Missouri listing (BAN.TXT). It should be tab-separated with lic_number, prc_first_name, prc_last_name, lst_description and lic_exp_date columns.")
  }
  return rows
    .map(r => ({
      jurisdiction: 'MO',
      number: (r.lic_number ?? '').trim(),
      type: 'Behavior Analyst',
      status: (r.lst_description ?? '').trim(),
      firstName: (r.prc_first_name ?? '').trim(),
      middleName: (r.prc_middle_name ?? '').trim(),
      lastName: (r.prc_last_name ?? '').trim(),
      city: (r.ba_city ?? '').trim(),
      state: (r.ba_state ?? '').trim(),
      expires: toIsoDate(r.lic_exp_date ?? ''),
    }))
    .filter(l => l.number !== '')
}
