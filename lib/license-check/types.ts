/** One license as a state publishes it, whichever state it came from. */
export type StateLicense = {
  jurisdiction: string
  number: string
  type: string
  status: string
  firstName: string
  middleName: string
  lastName: string
  city: string
  state: string
  expires: string | null   // ISO date
}

export type Person = {
  firstName: string
  lastName: string
  chosenName?: string | null
}

/** A state we can download, so the nightly job can run it and report on it. */
export type StateSource = {
  code: string
  /** Added to the "not found" explanation when this state's list has a known gap. */
  notFoundNote?: string
  /** The licenses, plus the date the state generated its file if it says. */
  fetch: () => Promise<{ licenses: StateLicense[]; sourceDate: string | null }>
}
