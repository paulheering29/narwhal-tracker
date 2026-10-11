## License Check

Lines CentralReach's staff download up against a state's license download, by name
(`core/src/licensure`), because that is what a practice has: the state list has no
CentralReach id and staff records carry no license number.

- **Nothing about a staff member is ever sent anywhere.** The matching happens on
  this computer. The only network use is optional and one-way: a button that downloads
  the state's public license list -- the same files, from the same public addresses,
  its own "Download License Data" page uses. Files can equally be downloaded by hand and
  dropped in, which is also the fallback if the state changes anything.
- **The button asks the state's own list which download is which**
  (`export/all`, then `export/data/license/{id}`), so it finds the two behavior analyst
  files by name and follows the state if it renumbers them. It is fixed to that one host,
  refuses redirects, caps sizes, checks that what came back is a ZIP, and only runs when
  pressed -- it never polls. A newer download of a license type replaces the older one.
  If the list changes shape the answer is a plain message, not a crash. The state's
  documented API needs a municipal or vendor key and looks up one license number at a
  time, so it is not used.
- **Only behavior analyst licenses are used**, even if the board's whole file is
  uploaded. Someone who shares a name with a counselor has not been found.
- **A shared name is `multiple`, never resolved.** Twenty-one names in the
  Massachusetts list belong to more than one license holder; quietly picking the one
  with a current license would report a person as licensed on a stranger's license.
- **Exact means the same first and last name**, ignoring case, accents, punctuation
  and spacing (`nameKey`). Close but not the same -- a first name that starts the
  other's, one that is the license's middle name, half a compound surname -- is
  `possible`, with the reason, for a person to confirm. Nothing looser is tried.
- **Standing comes from the expiration date as well as the state's status.** The
  file can say Current for a license whose date has passed; that is `expired`.
  Anything the state marks other than Current or Expired (suspended, surrendered,
  deceased, a non-disciplinary condition) is `needs review`, not a green tick.
- **The report is only as fresh as the download.** The state regenerates it daily;
  the report says how old the file it read is, and warns past a week.
- Licenses are normalised to one shape (`jurisdiction`, number, status, names,
  expiry), so another state is a new reader in `licensure/`, not a new matcher.

### More states

Each state is a reader in `core/src/licensure/` -- Massachusetts (ZIP), Rhode Island
(CSV), New Jersey (pipe-delimited `Data.txt`) -- that turns its file into the same
record shape, plus a fetcher in `main/license-check.js`. A state's list has to be read
for what it *leaves out* as much as what it holds, and `jurisdictions.js` carries what
to warn about:

- **Rhode Island publishes only active licenses**, so a lapse is `Not found`, not
  `Expired`.
- **New Jersey publishes applicants too** -- about one row in six is `Pending`, with no
  license number or dates. They are kept, as `Needs review`, because a staff member
  with an application in progress is worth knowing about, but they are not counted
  when deciding whether a name is shared (a person with an active assistant license and
  a pending application for the next is one person). Withdrawn and Deleted rows are
  neither a license nor a live application and are dropped. One license number can
  appear twice -- Expired, and Reinstatement Pending -- and both rows are kept, so it
  reads as needing review rather than expired.
- Across states a name is not "shared": each state's regulator is asked separately, and
  someone licensed in two states is unremarkable. Within one state it is.
- **Fetching differs by state**, and how sturdy it is follows. Massachusetts and Rhode
  Island are one or two plain requests. New Jersey has no address that returns its list:
  the state hands it out at the end of six pages (search, results, a confirmation that
  says the charge is $0.00, a choice of file type), each of which must be given back the
  hidden fields the last one set. `state-web-form.js` does what pressing those buttons in
  turn does -- reading each page's own fields rather than remembering any, staying on the
  one host, refusing redirects elsewhere -- and checks after every step that it landed
  where it expected. If the site changes, that check fails with a plain message and the
  manual upload still works.
- Files carry things nothing here wants -- New Jersey's list has an email address on
  every row, Rhode Island's a phone number -- and the readers leave them behind.
- **Arizona** publishes every behavior analyst it has ever licensed -- expired, lapsed,
  revoked -- with an expiry date on each. Its registry only serves a web browser (a plain
  request gets a 403, and the Board's own site sits behind a bot check), so there is no
  fetch button: the file is downloaded by hand and dropped in. The export's header has a
  space before its first quote and `&nbsp;` codes in one name, which stop a CSV reader
  seeing it, so it is tidied first; last names may carry a credential ("Aguilar, Ph.D.")
  that must not be part of the name compared; and the registry has a few test records.
  `Lapsed` counts as expired; `Active - Probation`, suspended, surrendered and revoked
  need review. A license the state still calls Active but whose date has passed is expired.
- License first names that include a middle name ("Hannah Francesca") are matched on the
  first word as well as the whole.

- **Washington** publishes every health credential it issues as an open dataset on
  data.wa.gov, with a public query API, so one request returns just the behavior analysts
  (about 3,500 rows) and asks for the columns by name, which keeps the birth year out. Its
  status column needs care: `Superseded` is an assistant credential replaced by a full
  license (all 245 of them), `Closed` and `Denied` are applications that came to nothing --
  all three are dropped -- and `Pending` is an application in progress, kept as needs review.
  It is dated by when the state last refreshed the dataset, not by today. The much larger
  Certified Behavior Technician (RBT-level) credential is deliberately not included.
- **A shared name is more than two license numbers.** In Washington 289 of the 290 repeated
  names were one person holding an assistant and a full license (their middle names agree
  every time). Two licenses under one name in one state are one person if they have
  different types and middle names that do not conflict -- someone who moved up -- and two
  people if they are the same type or the middle names conflict. Applications are never
  counted as a second person.

- **Texas, Illinois and Connecticut** all publish their licenses as open datasets with a
  public query API, like Washington, so each is one small request. What differs is what
  each dataset leaves out or crams together. **Texas** (TDLR, not the Behavioral Health
  Council) has no status column -- only an expiry date, so a license is judged by that date
  and a suspended-but-unexpired one would read as licensed, which the report says -- and one
  "LAST, FIRST MIDDLE" name column; only four columns are ever requested, so its addresses
  and phone numbers never come down. **Illinois** files behavior analysts under
  `description` "LICENSED BEHAVIORAL ANALYST" (with -AL: a search for "behavior analyst" finds
  none) and is almost all ACTIVE. **Connecticut** writes each name as one ALL-CAPS "FIRST
  MIDDLE LAST" line, so the last word is taken as the last name and a two-word last name
  surfaces as a possible match, not a miss; `INACTIVE` with a lapsed reason is recorded as
  Lapsed, `ACTIVE IN RENEWAL` past its date is left for a person, and expired applications
  are dropped.
- **The file loader is a table of readers** (`READERS` in `main/license-check.js`): each
  entry says how a state's file is recognised, read, and dated. The open-data states share
  one fetcher. Adding a state is one entry plus its reader in core.

### States looked at and not built

- **New York, Michigan and Virginia** license behavior analysts but publish no list -- only
  a name search (New York, Michigan) or a data request to the board (Virginia). Florida and
  California do not license them at all.
- **Indiana** sells its bulk list: $150 for the first record and $10 per further 1,000,
  as a CSV, real-time, by card or IN.gov subscription. Its free search is one person at a
  time. Nothing here can or should buy it, but a purchased CSV could be read like the others.
- **North Carolina** has no bulk list. Its directory sits behind a CAPTCHA and shows only
  issued, active licenses. The Board is the way to a roster (a public-records request).
- **Ohio's bulk file** (the whole state's licensees, 780 MB a day, behind a link that is
  only issued to a browser session) is not used -- see the next section for what is.

### Vermont

Vermont's Office of Professional Regulation lets anyone download a **roster** of a
profession -- with expiry dates -- from its "Find a Professional" guest pages (no login,
no CAPTCHA). It is a Pega application, so there is no URL for the file: the choices
(profession, statuses, type) are page actions that leave state on the server, and the
spreadsheet (`ApprovedLicencesExcelForRoster.xlsx`) is fetched from one more address
afterwards. `core/src/licensure/vermont.js` builds each request body; `main/vermont-sweep.js`
sends them in one cookie session (`state-web-form.js`) and reads each workbook with ExcelJS.
About 40 requests, 25 seconds, 538 licenses.

What it took to get a spreadsheet with rows in it (a wrong step gives a valid file with only
its headers, which looks like success):

- Every action carries a token the page issued (`pzuiactionzzz`), and the profession list,
  the ticks and the types each need **their own section's** token. Actions are found by what
  they *do* (`LookupType":"Roster+Download"`, `SetRosterDownloadStatuses`,
  `SetRosterDownloadApplicant`), not by the rule ids around them.
- **A ticked status only counts after its follow-up** -- the page refreshes the input section
  with `SetRosterDownloadStatuses` after every tick. Without it the file is empty.
- **The workbook is made when Download is pressed**, from the type chosen at that moment, so one
  session takes every type in turn: Applied and Assistant Behavior Analyst plus their
  Provisional, Emergency, Interim Telehealth and Facility Staff variants. The workbook does not
  say which type it is, so the sweep adds a License Type column.
- An **empty `Cookie:` header** makes this site answer 500 (curl omits it; Node's fetch sent it
  empty), so `state-web-form.js` sends the header only once there is a cookie.
- Found by driving the real page in a browser and comparing what it sent to a script's requests
  until the files matched; a replay of the recorded requests with *the page's own tokens* worked
  while one with re-derived tokens did not, which is how the status follow-up was found.

The list has name, city, state, status and expiry -- no street address, supervisor or employer.
Statuses seen: Active, Expired, Surrendered, Renewal Extension, Rescinded. Active and Expired
read as current/expired; the rest show as Needs review. A person can be on the list more than once
(a full license and a telehealth registration).

### Pennsylvania

Pennsylvania licenses behavior analysts as **Behavior Specialists** (State Board of
Medicine, `BH` numbers). The Department of State *sells* the whole list ($71 setup plus
$0.005 a name), so it was not bought; PALS, the public license search, gives the same
people away through a plain JSON call -- `POST pals.pa.gov/api/Search/SearchForPersonOrFacilty`
with `ProfessionID` 37 and `LicenseTypeId` 180 -- with no login, cookies or CAPTCHA
(the site's own `ShowCaptcha` setting is off; if it is switched on the answer stops being a
list and the fetch says so). It goes in the left-hand checklist like the open-data states
(`main/pennsylvania-sweep.js`, `core/src/licensure/pennsylvania.js`).

- A search answers **50 a page and never reports more than 500** (`TotalRecords` on each
  row stops at 500). One that says 500 is split by the next letter of the last name
  (a prefix match), recursively. About 200 requests, a bit over two minutes, 8,325 licenses.
  Checked against the license numbers: BH000001 to BH008786, and each of the 464 numbers not
  found was looked up directly and does not exist.
- **There is no expiry date** in the search results, only a status: Active (6,645),
  Expired, Inactive, Suspension, Voluntary Surrender, Revocation, Deceased. Active reads
  as current, Expired as expired, the rest as Needs review. (A per-person detail call may
  have the date; that is one request per person, and was not built.)
- PALS sends each person's phone and email with every row. Neither is kept: the CSV
  (`PA_CSV_HEADERS`) has name, status, city, state and county.

### Ohio

Ohio's license search page loads its results from a Salesforce Visualforce Remoting call
(`POST elicense.ohio.gov/apexremote`, method `findLicensesForOwner`) that answers with
JSON. Three things about it decide the design (`core/src/licensure/ohio.js`):

- **It returns at most 150 people**, and does not say so. The page shows ten a page, so
  fifteen pages looks like everything; Cuyahoga County alone also returns 150. A search
  that comes back with 150 is split by the start of the last name (`lastName` is a prefix
  match) -- letter by letter, and again where a piece is still full -- until every piece
  is smaller. This is checked against the license numbers themselves: COBA.1 to
  COBA.2058 are all present but four, so nothing was cut off.
- **A state must be given** (the licensee's address state) or it refuses the search as too
  broad. So the sweep asks once per state and territory code -- Ohio itself is about 1,840
  of the roughly 2,570 records, needing the letter splitting; the others are small.
- **Every call carries short-lived tokens** (`csrf`, `authorization`, `vid`) that the page
  hands each visitor and that last about three days (the expiry is inside the `csrf`). The
  page sits behind a bot check, so the app cannot get them itself. The person copies the
  search request out of their own browser (Network, `apexremote`, Copy as cURL) and pastes
  it into the right-hand card; the app reads the tokens out and drops everything else
  (cookies included), and they are never stored. An expired or refused one is reported as
  such.

The sweep (`main/ohio-sweep.js`) is one request at a time with a short pause, about two
minutes, and the result is written as a CSV (`OH_CSV_HEADERS`: no street address or zip)
and staged like any dropped file, so the same CSV also works from disk. The record is
Salesforce's compressed JSON -- shared objects are written once as `{s, v}` and referred
to as `{r}` -- so `resolveRefs` unfolds it first.

Ohio *certifies* its analysts (COBA numbers) and lists applications too (`APP-` numbers,
status Submitted, no expiry). Closed (abandoned applications) and Inactive/Withdrawn are
dropped; Inactive/Expired is Expired; Submitted is kept and reads as Needs review, and does
not count towards two people sharing a name.

### Choosing which states to fetch

The Upload screen has two columns. On the left, a checklist of the states the app can
fetch and one button that gets everything ticked, one state after another in list order.
A state that fails does not stop the rest; every failure is reported together, naming the
state, and the screen stays on Upload so the reasons can be read. It moves on to the report
only when everything ticked came through. The ticks are remembered (localStorage -- a
convenience, so it is allowed to fail). On the right, the states that only serve a web
browser (Arizona) or need a copied request (Ohio), each with a link and the steps.

