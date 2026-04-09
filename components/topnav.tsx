'use client'

import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  ShieldCheck,
  LogOut,
  UserCircle,
  BarChart2,
  ChevronDown,
  Tag,
  CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { showAdminNav, rolesDisplay } from '@/lib/permissions'

interface TopNavProps {
  userTier:   'rbt' | 'staff'
  userRoles:  string[]
  userEmail:  string
}

const BG = '#457595'

const staffNavItems = [
  { href: '/dashboard',  label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/staff',      label: 'RBT',              icon: Users           },
  { href: '/trainings',  label: 'Trainings',        icon: BookOpen        },
  { href: '/training',   label: 'Training Records', icon: ClipboardList   },
]

const rbtNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

const analyticsItems = [
  { href: '/analytics/topics', label: 'Topic Analysis', icon: Tag },
]

export function TopNav({ userTier, userRoles, userEmail }: TopNavProps) {
  const pathname   = usePathname()
  const supabase   = createClient()
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const analyticsRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (analyticsRef.current && !analyticsRef.current.contains(e.target as Node)) {
        setAnalyticsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Close on route change
  useEffect(() => { setAnalyticsOpen(false) }, [pathname])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  }

  const navItems = userTier === 'rbt' ? rbtNavItems : staffNavItems

  return (
    <header style={{ backgroundColor: BG }} className="w-full shrink-0 shadow-md">
      <div className="flex h-14 items-center px-6 gap-6">

        {/* Brand */}
        <Link href="/dashboard" className="shrink-0 mr-4 flex items-center gap-2.5">
          <Image
            src="/narwhal-tracker.jpg"
            alt="Narwhal Tracker"
            width={120}
            height={36}
            className="h-9 w-auto rounded"
            priority
          />
          <span className="text-white font-semibold text-lg leading-none tracking-tight whitespace-nowrap">
            Narwhal Tracker
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive(href)
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}

          {/* Analytics dropdown — staff only */}
          {userTier === 'staff' && (
            <div className="relative" ref={analyticsRef}>
              <button
                onClick={() => setAnalyticsOpen(o => !o)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive('/analytics')
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <BarChart2 className="h-4 w-4 shrink-0" />
                Analytics
                <ChevronDown className={cn('h-3 w-3 transition-transform', analyticsOpen && 'rotate-180')} />
              </button>

              {analyticsOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-52 rounded-lg bg-white shadow-lg border border-gray-100 py-1 z-50">
                  {analyticsItems.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {showAdminNav(userRoles) && (
            <>
              <Link
                href="/admin/users"
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive('/admin')
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Admin
              </Link>
              <Link
                href="/billing"
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive('/billing')
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <CreditCard className="h-4 w-4 shrink-0" />
                Billing
              </Link>
            </>
          )}
        </nav>

        {/* User info + settings + sign out */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-white/60 leading-none">{userEmail}</p>
            <p className="text-xs text-white/80 font-medium leading-none mt-0.5">
              {rolesDisplay(userTier, userRoles)}
            </p>
          </div>
          <Link
            href="/settings"
            title="Profile &amp; Signature"
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
              isActive('/settings')
                ? 'bg-white/20 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <UserCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </Link>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>

      </div>
    </header>
  )
}
