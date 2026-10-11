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

/**
 * What the nightly check against the state's published list found. Green is
 * good, red is bad; the reason is in the tooltip. Nothing is shown until the
 * first check has run for the license (or for states we don't download yet).
 */
export function VerificationBadge({ license }: { license: Pick<StaffLicense, 'verified_at' | 'verification_result' | 'verification_detail'> }) {
  if (!license.verification_result || !license.verified_at) return null
  const when = fmtLicenseDate(license.verified_at.slice(0, 10))
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[license.verification_result]}`}
      title={`${license.verification_detail ?? ''} Last checked ${when}.`.trim()}
    >
      {LABEL[license.verification_result]} · {when}
    </span>
  )
}
