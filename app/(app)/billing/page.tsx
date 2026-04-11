import { redirect } from 'next/navigation'

/**
 * Billing has moved into the Admin page as a tab. Preserve the /billing
 * path for back-compat (stripe return URLs, old bookmarks) by redirecting.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>
}) {
  const { success } = await searchParams
  const qs = success === 'true' ? '?tab=billing&success=true' : '?tab=billing'
  redirect(`/admin/users${qs}`)
}
