import { fmtLicenseDate, type StaffLicense } from '@/lib/licensure'

const STYLE = {
  verified:  'bg-emerald-50 text-emerald-700',
  review:    'bg-amber-50 text-amber-700',
  expired:   'bg-red-50 text-red-700',
  not_found: 'bg-red-50 text-red-700',
} as const

const LABEL = {
  verified: 'Verified', review: 'Needs review', expired: 'State: expired', not_found: 'Not found',
} as const

/** A license needs a person's attention when the check found anything but a clean match. */
export const needsAttention = (l: Pick<StaffLicense, 'verification_result'>) =>
  l.verification_result !== null && l.verification_result !== 'verified'

/**
 * What the nightly check against the state's published list found. Green is
 * good, red is bad; the reason is in the tooltip.
 *
 * `covered` is whether this organization has nightly checking turned on for the
 * state. Without it, a missing badge would look like "not checked yet" when it
 * really means "never will be", so say so.
 */
export function VerificationBadge({ license, covered }: {
  license: Pick<StaffLicense, 'verified_at' | 'verification_result' | 'verification_detail'>
  covered: boolean
}) {
  if (!covered) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
        title="Nightly checking isn't turned on for this state. The Account Owner can add it under Admin → Account → Billing ($10/month per state), or verify it with the state's own lookup.">
        Not auto-verified
      </span>
    )
  }
  if (!license.verification_result || !license.verified_at) {
    return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500" title="The nightly check hasn't run for this license yet.">Awaiting first check</span>
  }
  const when = fmtLicenseDate(license.verified_at.slice(0, 10))
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STYLE[license.verification_result]}`}
      title={`${license.verification_detail ?? ''} Last checked ${when}.`.trim()}
    >
      {LABEL[license.verification_result]} · {when}
    </span>
  )
}
