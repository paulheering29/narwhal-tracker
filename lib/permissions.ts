/**
 * Permission helpers.
 *
 * Two-layer system:
 *   tier  – 'rbt' | 'staff'   (hard DB boundary, enforced by RLS)
 *   roles – string[]           (app-layer gates: Trainer, Admin, Account Owner)
 *
 * RBTs: login, view own records, print own certs. Nothing else.
 * Staff: all non-RBT users. Specific capabilities depend on roles[].
 */

export type UserTier = 'rbt' | 'staff'
export type UserRole = 'Trainer' | 'Admin' | 'Account Owner'

export const ALL_ROLES: UserRole[] = ['Trainer', 'Admin', 'Account Owner']

/** True if the user has the given role. */
export function hasRole(roles: string[], role: UserRole): boolean {
  return roles.includes(role)
}

/** True if the user can manage trainings and attendees. */
export function canManageTrainings(roles: string[]): boolean {
  return hasRole(roles, 'Trainer') || hasRole(roles, 'Admin') || hasRole(roles, 'Account Owner')
}

/** True if the user can add/manage RBT staff records. */
export function canManageRBTs(roles: string[]): boolean {
  return hasRole(roles, 'Trainer') || hasRole(roles, 'Admin') || hasRole(roles, 'Account Owner')
}

/** True if the user can manage app users (invite, change roles). */
export function canManageUsers(roles: string[]): boolean {
  return hasRole(roles, 'Admin') || hasRole(roles, 'Account Owner')
}

/** True if the user can manage permissions (the Admin page). */
export function canManagePermissions(roles: string[]): boolean {
  return hasRole(roles, 'Admin') || hasRole(roles, 'Account Owner')
}

/** True if the user should see the Admin nav item. */
export function showAdminNav(roles: string[]): boolean {
  return canManageUsers(roles)
}

/** Display string for a user's roles (e.g. "Trainer · Admin"). */
export function rolesDisplay(tier: string, roles: string[]): string {
  if (tier === 'rbt') return 'RBT'
  if (roles.length === 0) return 'Staff'
  return roles.join(' · ')
}
