import { redirect } from 'next/navigation'

// My Progress is now the "My Dashboard" tab on /dashboard; kept so old links work.
export default function MyProgressPage() {
  redirect('/dashboard?view=my')
}
