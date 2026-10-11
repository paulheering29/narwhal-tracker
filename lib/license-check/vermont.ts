import ExcelJS from 'exceljs'
import { toIsoDate } from './csv'
import { openFormSession } from './web-form'
import {
  VT_HOST, VT_START_URL, VT_BROWSER_HEADERS, VT_LICENSE_TYPES, VT_PROFESSION, VT_STATUS_COUNT,
  readVtStart, readVtActions, readVtValueTokens, vtTabRequest, vtChoiceRequest, vtTickRequest,
  vtStatusRefreshRequest, vtDownloadRequest, vtSpreadsheetUrl, vtRow,
} from './vermont-protocol'
import type { StateLicense, StateSource } from './types'

// Vermont's Office of Professional Regulation lets anyone download a roster of a
// profession, with expiry dates, from its guest pages. It is a Pega application,
// so there is no URL for the file: about forty page actions in one cookie session
// (see vermont-protocol.js), then one Excel workbook per license type.
const MAX_BYTES = 5_000_000
const PAUSE_MS = 150
const pause = () => new Promise(r => setTimeout(r, PAUSE_MS))

async function rosterLines(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  const headers: string[] = []
  sheet.getRow(1).eachCell((cell, column) => { headers[column] = String(cell.text ?? '').trim() })
  const lines: Record<string, string>[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const line: Record<string, string> = {}
    row.eachCell((cell, column) => {
      if (headers[column]) line[headers[column]] = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : String(cell.text ?? '')
    })
    lines.push(line)
  })
  return lines
}

export const vermont: StateSource = {
  code: 'VT',
  async fetch() {
    const site = openFormSession(VT_HOST, { maxBytes: MAX_BYTES })
    const start = await site.get(VT_START_URL)
    const session = readVtStart(start.html, start.url)
    if (!session || !(session.sections as Record<string, string>).FindAProfessionalWrapper) throw new Error("Vermont's roster page wasn't in the form we expected.")

    const headers = { ...VT_BROWSER_HEADERS, pzCTkn: session.csrf }
    const send = async ({ url, body }: { url: string; body: string }) => {
      const page = await site.post(url, body, headers)
      await pause()
      return page
    }

    // The roster page, and the tokens it issues for the choices made on it.
    const roster = await send(vtTabRequest(session))
    session.actions = readVtActions(roster.html)
    const tokens = readVtValueTokens(roster.html)
    if (!tokens.profession || !tokens.status || !tokens.type || !session.actions.statuses || !session.actions.download || !session.actions.spreadsheetPath) {
      throw new Error("Vermont's roster page no longer offers what the download needs.")
    }

    await send(vtChoiceRequest(session, { property: 'ProductIds', value: VT_PROFESSION, token: tokens.profession }))
    for (let nth = 1; nth <= VT_STATUS_COUNT; nth += 1) {
      await send(vtTickRequest(session, tokens, nth))
      await send(vtStatusRefreshRequest(session, nth))
    }

    const licenses: StateLicense[] = []
    for (const type of VT_LICENSE_TYPES) {
      await send(vtChoiceRequest(session, { property: 'SetProfessionType', value: type.id, token: tokens.type }))
      await send(vtDownloadRequest(session))
      const file = await site.get(vtSpreadsheetUrl(session))
      // An .xlsx is a zip; anything else is a page telling us it did not work.
      if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) throw new Error("Vermont's site did not give a spreadsheet.")
      for (const line of await rosterLines(file.buffer)) {
        const r = vtRow(line, type.name)
        if (r['License Number'] === '') continue
        licenses.push({
          jurisdiction: 'VT', number: r['License Number'], type: r['License Type'], status: r.Status,
          firstName: r['First Name'], middleName: r['Middle Name'], lastName: r['Last Name'],
          city: r.City, state: r.State, expires: toIsoDate(r.Expires),
        })
      }
    }
    return { licenses, sourceDate: null }
  },
}
