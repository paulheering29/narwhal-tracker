# License Check -- extracted from System Review, 2026-09-21

License Check lined up CentralReach's staff download with state license lists, by name, and
said whose license was current, expiring, expired or missing. It was taken out of System
Review because it is not something a practice can run self-serve. This folder is everything
it was, so it can be reused in the separate app.

**This folder is the only copy.** System Review's working tree had never been committed when
the code was removed. Put it in git before doing anything else with it.

## What is here

| Folder | What |
| --- | --- |
| `code/` | The files exactly as they were, at their old paths in the repo (`packages/core/...`, `packages/desktop/...`, `supabase/...`). |
| `integration/` | The bits that lived inside System Review's own files: the IPC handlers, the preload bridge, module/App/Sidebar wiring, the CSS, the architecture doc section, and optional SQL to undo the migration. |
| `shared-dependencies/` | Copies of the System Review code the extracted files import (CSV parsing and column matching, file-type detection, `toIsoDate`, `toCsv`, the CSV export). The other app needs equivalents. |
| `dev-scripts/` | The scripts used to work out each state's site and to test against it live. Not part of the app. Captured data and session tokens were left out. |

## The pieces

**Core (pure, no I/O)** -- `code/packages/core/src/licensure/`
- `match.js` -- `matchLicenses(staff, licenses, today)`: the rules. Exact and possible name matches; outcomes
  `expired, review, none, multiple, possible, expiring, current`; `EXPIRING_DAYS = 90`; blank status is judged by
  expiry; people sharing a name inside one state are not counted as a match for each other unless they are plainly
  the same person (`sameHolder`); applicants (Pending/Submitted) never count as licensed.
- `names.js` -- `nameKey`, `nameTokens`, `splitCommaName`, `splitPlainName`.
- One reader per state (`massachusetts.js`, `rhodeIsland.js`, `newJersey.js`, `arizona.js`, `washington.js`, `texas.js`,
  `illinois.js`, `connecticut.js`, `ohio.js`, `pennsylvania.js`, `vermont.js`): turns that state's file into one shape
  (`{ jurisdiction, number, type, status, firstName, middleName, lastName, suffix, city, state, expires }`).
  Each also has `identifyXxLicenseFile(headers)` so a file is recognised by its headers, never its name.
- `jurisdictions.js` -- per-state names and the warnings the report shows.
- `webForm.js` -- reads a page's hidden form fields (used for New Jersey's multi-page download).
- Tests: `code/packages/core/test/{licensure,ohio,pennsylvania,vermont}.test.js` (about 150 tests; the whole repo's core
  suite was 896 passing when this was taken out).

**Desktop main** -- `code/packages/desktop/src/main/`
- `license-check.js` -- stages files (CSV, TXT or ZIP), the `READERS` table (adding a state is one entry plus its
  core reader), the fetchers, and `licenseCheckResults(today)`.
- `state-web-form.js` -- a small cookie-keeping session for sites that need several page requests; stays on one
  host, refuses redirects elsewhere, sends no empty `Cookie` header (Vermont answers that with a 500).
- `ohio-sweep.js`, `pennsylvania-sweep.js`, `vermont-sweep.js` -- the three states whose lists have to be assembled
  from many requests.

**Renderer** -- `code/packages/desktop/src/renderer/src/components/license-check/` (Upload with the checklist of
states to fetch, and the Report with outcome tiles, search, sort and CSV export).

## How each state's list was obtained (all checked live 2026-09-20)

| State | How | Notes |
| --- | --- | --- |
| MA | Public list + id endpoints, ZIP | Lapsed licenses included. |
| RI | POST to the licensee-list page | Active licenses only. |
| NJ | Six-step ASP.NET form replay | Includes Pending. |
| AZ | Browser only (403 to anything else) | Must be downloaded by hand; the app cannot fetch it. |
| WA, TX, IL, CT | Socrata open-data CSV | TX has no status column, only expiry. |
| OH | eLicense Ohio's Visualforce `apexremote` call | Result cap of 150, so it is split by last-name prefix; needs short-lived tokens copied from the person's own browser (about 3 days), which is why it needs a paste step. |
| PA | PALS `SearchForPersonOrFacilty` | Result cap of 500, split by last-name prefix; status but no expiry date. The state also sells the list. |
| VT | Pega "Profession Roster Download" | A chain of page actions with tokens the page issues; see `integration/architecture-license-check.md`. |

Looked at and not built: Indiana (paid list), North Carolina (CAPTCHA, no bulk list), New York, Michigan and
Virginia (no list published), Florida and California (do not license behavior analysts). Details are in the
architecture doc section.

## What the app around it provided

- IPC: `licenseCheck:*` handlers and a `window.systemReview.licenseCheck` bridge (see `integration/`).
- A module id `license-check` and a permission gate (`requireModule`).
- `useTerms()` for the renderer's staff wording, and `api`/`call` for the bridge.
- Dependencies: `jszip` (Massachusetts' ZIP), `exceljs` (Vermont's workbooks), `papaparse` (via core's `parseCsv`),
  `@tabler/icons-react`, `@tanstack/react-table`.

## Database

`code/supabase/migrations/0018_license_check.sql` only registered the module id in System Review's tables. Nothing
about anyone's staff or licenses was ever stored: both files are read on the person's own computer. If 0018 was run
against a database, `integration/remove-license-check-from-supabase.sql` undoes it (optional).

## Things worth knowing before reusing it

- Names are the only key. Matches are by first/last name; a person can match "possible" when a middle name, a
  nickname-length prefix or half of a compound last name lines up. Nothing uses a license number from the staff side.
- The government sites can change. Vermont and Ohio in particular replay what the site's own page sends, and the fetch
  says so plainly when the page no longer offers what it needs; Arizona and Indiana were never automatable.
- Nothing about the staff list is ever sent to a state: the app only downloads public lists, and the match runs locally.
