type NameFields = {
  first_name: string
  last_name: string
  display_first_name?: string | null
  display_last_name?: string | null
}

/**
 * Returns the name to show everywhere in the app UI.
 * Falls back to legal name when preferred name is not set.
 */
export function getDisplayName(staff: NameFields): string {
  const first = staff.display_first_name?.trim() || staff.first_name
  const last  = staff.display_last_name?.trim()  || staff.last_name
  return `${first} ${last}`
}

/**
 * Returns true if the person has any preferred name different from their legal name.
 */
export function hasPreferredName(staff: NameFields): boolean {
  return !!(
    (staff.display_first_name?.trim() && staff.display_first_name.trim() !== staff.first_name) ||
    (staff.display_last_name?.trim()  && staff.display_last_name.trim()  !== staff.last_name)
  )
}

/**
 * Always returns the legal name. Used for printed certifications.
 */
export function getLegalName(staff: NameFields): string {
  return `${staff.first_name} ${staff.last_name}`
}
