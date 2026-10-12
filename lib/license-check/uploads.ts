import { readArizonaExport } from './arizona'
import { readMissouriList } from './missouri'
import type { StateLicense } from './types'

/** States whose list the owner downloads by hand and uploads as a file. Add a state here with its reader. */
export const UPLOAD_READERS: Record<string, (text: string) => StateLicense[]> = {
  AZ: readArizonaExport,
  MO: readMissouriList,
}

/** What to add to a "not found" result where the state's list has a known gap. */
export const MANUAL_NOT_FOUND_NOTES: Record<string, string> = {
  MO: 'Missouri publishes only current licenses, so a lapsed license also shows as not found.',
}
