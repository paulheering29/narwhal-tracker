import Link from 'next/link'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'company', label: 'Company Dashboard', href: '/dashboard' },
  { key: 'my',      label: 'My Dashboard',      href: '/dashboard?view=my' },
] as const

export function DashboardTabs({ active }: { active: 'company' | 'my' }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-gray-200">
      {TABS.map(t => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            t.key === active
              ? 'border-[#025CA8] text-[#025CA8]'
              : 'border-transparent text-gray-500 hover:text-gray-900',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
