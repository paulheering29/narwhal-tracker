/**
 * The states License Check can read, and what is worth knowing about each one's
 * list before trusting it.
 *
 * `activeOnly` is the one that changes what the report means. Massachusetts
 * publishes lapsed licenses too, so a lapse shows as "Expired". Rhode Island
 * publishes only active licenses, so someone whose license lapsed is simply not
 * in the list -- and shows as "Not found", which is true but not the whole story.
 */
export const JURISDICTIONS = {
  MA: { code: 'MA', name: 'Massachusetts', activeOnly: false },
  RI: {
    code: 'RI', name: 'Rhode Island', activeOnly: true,
    note: 'lists active licenses only, so someone whose license has lapsed there shows as Not found rather than Expired.',
  },
  AZ: { code: 'AZ', name: 'Arizona', activeOnly: false },
  VT: {
    code: 'VT', name: 'Vermont', activeOnly: false,
    note: 'lists Applied and Assistant Behavior Analysts, and provisional and interim telehealth registrations too, so a person can be on the list more than once. A license marked Renewal Extension or Surrendered shows as Needs review.',
  },
  PA: {
    code: 'PA', name: 'Pennsylvania', activeOnly: false,
    note: 'licenses behavior analysts as Behavior Specialists, and publishes no expiry date, only a status: a license reads as current if the state calls it Active.',
  },
  OH: {
    code: 'OH', name: 'Ohio', activeOnly: false,
    note: 'certifies its behavior analysts rather than licensing them, and lists applications as well: someone whose application is Submitted shows as Needs review.',
  },
  TX: {
    code: 'TX', name: 'Texas', activeOnly: false,
    note: 'publishes no status, only when each license expires, so a license is judged by that date alone. One that has been suspended or revoked but has not yet expired would still show as Licensed.',
  },
  IL: {
    code: 'IL', name: 'Illinois', activeOnly: true,
    note: 'lists almost only active licenses, so someone whose license has lapsed there is likely to show as Not found rather than Expired.',
  },
  CT: {
    code: 'CT', name: 'Connecticut', activeOnly: false,
    note: 'writes each name as one line, so a last name of more than one word may show as a Possible match to confirm. A license marked Active In Renewal whose date has passed shows as Needs review.',
  },
  WA: {
    code: 'WA', name: 'Washington', activeOnly: false,
    note: 'lists applicants as well as those licensed, so someone whose application is still Pending shows as Needs review. Credentials that were replaced, closed or denied are left out.',
  },
  NJ: {
    code: 'NJ', name: 'New Jersey', activeOnly: false,
    note: 'lists people who have applied as well as those licensed, so someone whose application is still Pending shows as Needs review, not Licensed.',
  },
};

export const jurisdictionName = (code) => JURISDICTIONS[code]?.name ?? code;
