export type CycleStatus = 'upcoming' | 'active' | 'completed'

/**
 * Derives cycle status purely from dates — never stored in the DB.
 */
export function getCycleStatus(startDate: string, endDate: string): CycleStatus {
  const today = new Date().toISOString().split('T')[0]
  if (today < startDate) return 'upcoming'
  if (today > endDate)   return 'completed'
  return 'active'
}

export function isActiveCycle(startDate: string, endDate: string): boolean {
  return getCycleStatus(startDate, endDate) === 'active'
}

export const cycleStatusStyles: Record<CycleStatus, string> = {
  active:    'bg-emerald-100 text-emerald-700',
  upcoming:  'bg-blue-100 text-blue-700',
  completed: 'bg-gray-100 text-gray-500',
}
