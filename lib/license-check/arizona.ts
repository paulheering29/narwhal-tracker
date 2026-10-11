import { parseCsv, toIsoDate } from './csv'
import type { StateLicense } from './types'

// The Arizona Board of Psychologist Examiners' public registry export. Its
// "Download (.csv)" button gives every behavior analyst the Board has ever
// licensed (expired, revoked and deceased included) with a status and expiry date.
// The site refuses everything but a web browser, so the file is downloaded by hand
// and uploaded.
const REQUIRED = ['License Number', 'First Name', 'Last Name', 'License Type', 'License Status', 'License Expiry Date']
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Put right the two things about the header that stop a CSV reader seeing it:
 * whitespace before the first quote, and &nbsp; codes ("License Status" ends in two).
 */
function tidy(text: string) {
  const start = text.slice(0, 400)
  if (!/License Number/i.test(start) || !/License Expiry Date/i.test(start)) return text
  return text.replace(/^\s+/, '').replace(/&nbsp;/g, ' ')
}

/** @throws if the text isn't Arizona's export. */
export function readArizonaExport(text: string): StateLicense[] {
  const { headers, rows } = parseCsv(tidy(text))
  if (!REQUIRED.every(c => headers.some(h => norm(h) === norm(c)))) {
    throw new Error("That doesn't look like Arizona's registry export. It should have License Number, License Type, License Status and License Expiry Date columns.")
  }
  const read = (row: Record<string, string>, name: string) => {
    const key = Object.keys(row).find(h => norm(h) === norm(name))
    return key === undefined ? '' : (row[key] ?? '').trim()
  }

  return rows
    .map(row => {
      // A credential can follow a comma in the last name ("Aguilar, Ph.D."); it is no part of the name.
      const lastName = read(row, 'Last Name').split(',')[0].trim()
      return {
        jurisdiction: 'AZ', number: read(row, 'License Number'), type: read(row, 'License Type'), status: read(row, 'License Status'),
        firstName: read(row, 'First Name'), middleName: '', lastName,
        city: read(row, 'City').replace(/,\s*$/, ''), state: '',   // the file has no state column: everyone is Arizona's
        expires: toIsoDate(read(row, 'License Expiry Date')),
      }
    })
    .filter(l => /behavior analyst/i.test(l.type))
    // The registry holds a few records people made to try it out.
    .filter(l => l.number !== '' && !/test/i.test(l.number))
}
