import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDisplayName } from '@/lib/display-name'
import { ArrowRight, GraduationCap, Route, Users } from 'lucide-react'

// Where a new organization lands after confirming their email.
export default async function WelcomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('staff')
    .select('first_name, last_name, display_first_name, display_last_name, tier')
    .eq('auth_id', user.id)
    .single()
  if (!me || me.tier !== 'staff') redirect('/dashboard')

  const steps = [
    {
      icon: Users, title: 'Add your team',
      body: 'Import your RBTs and BCBAs from a spreadsheet, with certification numbers and cycle dates.',
      href: '/staff', cta: 'Go to Staff',
    },
    {
      icon: GraduationCap, title: 'Add a course or a training',
      body: 'Upload a self-paced video course, or schedule a live in-service and take attendance.',
      href: '/courses', cta: 'Add a course',
    },
    {
      icon: Route, title: 'Build a learning path',
      body: 'Bundle courses into something like “New RBT Onboarding” and assign it in one click.',
      href: '/paths', cta: 'Create a path',
    },
  ]

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900">Welcome to Training Loop, {getDisplayName(me).split(' ')[0]}.</h1>
      <p className="mt-1 mb-8 text-sm text-gray-500">Your organization is ready. Here’s a good order to set things up.</p>
      <ol className="space-y-4">
        {steps.map(({ icon: Icon, title, body, href, cta }, i) => (
          <li key={title} className="flex items-start gap-4 rounded-xl border bg-white p-5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#025CA8] text-white">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">{i + 1}. {title}</p>
              <p className="mt-0.5 text-sm text-gray-500">{body}</p>
            </div>
            <Link href={href} className="inline-flex shrink-0 items-center gap-1.5 self-center text-sm font-medium text-[#025CA8] hover:underline">
              {cta} <ArrowRight className="h-4 w-4" />
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-gray-500">
        You have 30 days to try everything, no card needed. Subscribe any time from <Link href="/admin/users?tab=account" className="text-[#025CA8] hover:underline">Admin → Account</Link>.
      </p>
    </div>
  )
}
