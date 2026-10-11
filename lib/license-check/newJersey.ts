import { parseCsv, toIsoDate } from './csv'
import { openFormSession } from './web-form'
import type { StateLicense, StateSource } from './types'

// New Jersey has no address that returns its list: the state hands it out at the
// end of a run of pages (search, results, a confirmation that says the charge is
// $0.00, a choice of file type), each of which must be given back the hidden
// fields the last one set. This does what pressing those buttons in turn does,
// and checks after every step that it landed where it expected -- if the site
// changes, that is the answer, not a guess at what to press next.
const HOST = 'newjersey.mylicense.com'
const SEARCH_URL = `https://${HOST}/Verification_Bulk/Search.aspx?facility=N`
const PROFESSION = 'Applied Behavior Analysts'

// Withdrawn applications and deleted records are neither a license nor a live application.
const NOT_A_LICENSE = new Set(['withdrawn', 'deleted'])

export const newJersey: StateSource = {
  code: 'NJ',
  async fetch() {
    const session = openFormSession(HOST, { maxBytes: 20_000_000 })
    const step = async (page: Awaited<ReturnType<typeof session.get>>, changes: Record<string, string>, expects: RegExp, what: string) => {
      const next = await session.submit(page, changes)
      if (!next.isPage || !expects.test(next.html)) throw new Error(`New Jersey's site didn't respond the way it used to (${what}).`)
      return next
    }

    let page = await session.get(SEARCH_URL)
    if (!page.isPage || !/t_web_lookup__profession_name/.test(page.html)) throw new Error("New Jersey's site didn't respond the way it used to (its search form).")
    page = await step(page, { t_web_lookup__profession_name: PROFESSION, sch_button: 'Search' }, /btnBulkDownLoad/, 'its list of behavior analysts')
    page = await step(page, { btnBulkDownLoad: 'Download List' }, /btnContinue/, 'its confirmation page')
    page = await step(page, { btnContinue: 'Continue' }, /name="filetype"/, 'its file type page')

    const file = await session.submit(page, { sch_button: 'Download', filetype: 'delimitedtext' })
    if (file.isPage) throw new Error("New Jersey's site sent a web page where the list should be.")

    const { headers, rows } = parseCsv(file.buffer.toString('utf8'), '|')
    const need = ['license_no', 'license_status_name', 'license_type_name', 'profession_name', 'first_name', 'last_name', 'expiration_date']
    if (!need.every(n => headers.includes(n))) throw new Error("New Jersey's list didn't have the columns we expected.")

    const cell = (r: Record<string, string>, n: string) => (r[n] ?? '').trim()
    let applicants = 0
    const licenses: StateLicense[] = rows
      .filter(r => /behavior analyst/i.test(cell(r, 'profession_name')))
      .filter(r => !NOT_A_LICENSE.has(cell(r, 'license_status_name').toLowerCase()))
      .map(r => {
        // An applicant has no license number or dates. Kept, so someone partway there reads as
        // "needs review" and not as missing; the stand-in number only keeps the row unique.
        const number = cell(r, 'license_no') || `APPLICANT-${(applicants += 1)}`
        return {
          jurisdiction: 'NJ', number, type: cell(r, 'license_type_name'), status: cell(r, 'license_status_name'),
          firstName: cell(r, 'first_name'), middleName: cell(r, 'middle_name'), lastName: cell(r, 'last_name'),
          city: cell(r, 'addr_city'), state: cell(r, 'addr_state'), expires: toIsoDate(cell(r, 'expiration_date')),
        }
      })
    return { licenses, sourceDate: null }
  },
}
