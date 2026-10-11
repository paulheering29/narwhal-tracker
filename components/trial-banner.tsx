import Link from 'next/link'

/** Shown to the Account Owner during the trial; the only person who can act on it. */
export function TrialBanner({ daysLeft }: { daysLeft: number }) {
  return (
    <div className="flex items-center justify-center gap-2 bg-blue-50 border-b border-blue-100 px-4 py-2 text-sm text-[#025CA8]">
      <span>
        {daysLeft === 0 ? 'Your free trial ends today.' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left in your free trial.`}
      </span>
      <Link href="/admin/users?tab=account" className="font-semibold underline">Subscribe</Link>
    </div>
  )
}
