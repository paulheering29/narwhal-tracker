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
  ShieldCheck,
  LogOut,
  UserCircle,
  BarChart2,
  ChevronDown,
  Tag,
  Award,
  GitCommitHorizontal,
  Menu,
  X,
  PlayCircle,
  GraduationCap,
  Gauge,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { showAdminNav, rolesDisplay } from '@/lib/permissions'

interface TopNavProps {
  userTier:   'rbt' | 'staff'
  userRoles:  string[]
  userName:   string
  showMyProgress: boolean
}

const BG = '#ffffff'

const staffNavItems = [
  { href: '/dashboard',    label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/staff',        label: 'Staff',       icon: Users           },
  { href: '/trainings',    label: 'Trainings',   icon: BookOpen        },
  { href: '/courses',      label: 'Courses',     icon: PlayCircle      },
  { href: '/my-courses',   label: 'My Courses',  icon: GraduationCap   },
]

const rbtNavItems = [
  { href: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/my-courses',  label: 'My Courses',  icon: GraduationCap   },
]

const analyticsItems = [
  { href: '/analytics/topics',        label: 'Topic Analysis', icon: Tag        },
  { href: '/analytics/rbt-insights',  label: 'RBT Insights',   icon: Award      },
  { href: '/analytics/rbt-timeline',  label: 'RBT Timeline',   icon: GitCommitHorizontal },
]

export function TopNav({ userTier, userRoles, userName, showMyProgress }: TopNavProps) {
  const pathname   = usePathname()
  const supabase   = createClient()
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [mobileOpen, setMobileOpen]       = useState(false)
  const analyticsRef = useRef<HTMLDivElement>(null)

  // Close analytics dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (analyticsRef.current && !analyticsRef.current.contains(e.target as Node)) {
        setAnalyticsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Close everything on route change
  useEffect(() => {
    setAnalyticsOpen(false)
    setMobileOpen(false)
  }, [pathname])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  }

  const navItems = userTier === 'rbt'
    ? rbtNavItems
    : showMyProgress
      ? [...staffNavItems, { href: '/my-progress', label: 'My Progress', icon: Gauge }]
      : staffNavItems

  return (
    <>
      <header style={{ backgroundColor: BG }} className="w-full shrink-0 border-b border-gray-200 shadow-sm relative z-40">
        <div className="flex h-14 items-center px-4 md:px-6 gap-4">

          {/* Brand */}
          <Link href="/dashboard" className="shrink-0 flex items-center">
            <Image
              src="/training-loop-wordmark.png"
              alt="Training Loop"
              width={2195}
              height={340}
              className="h-6 w-auto"
              priority
            />
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden lg:flex items-center gap-1 flex-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive(href)
                    ? 'bg-[#025CA8]/10 text-[#025CA8]'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                    isActive('/analytics')
                      ? 'bg-[#025CA8]/10 text-[#025CA8]'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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
              <Link
                href="/admin/users"
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive('/admin')
                    ? 'bg-[#025CA8]/10 text-[#025CA8]'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Admin
              </Link>
            )}
          </nav>

          {/* Desktop: user info + profile + sign out */}
          <div className="hidden lg:flex items-center gap-3 shrink-0 ml-auto">
            <div className="text-right">
              <p className="text-xs text-gray-500 leading-none">{userName}</p>
              <p className="text-xs text-gray-700 font-medium leading-none mt-0.5">
                {rolesDisplay(userTier, userRoles)}
              </p>
            </div>
            <Link
              href="/settings"
              title="Profile &amp; Signature"
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                isActive('/settings')
                  ? 'bg-[#025CA8]/10 text-[#025CA8]'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <UserCircle className="h-4 w-4" />
              Profile
            </Link>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>

          {/* Mobile: hamburger button */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="lg:hidden ml-auto flex items-center justify-center h-9 w-9 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute top-14 left-0 right-0 shadow-xl"
            style={{ backgroundColor: BG }}
            onClick={e => e.stopPropagation()}
          >
            <nav className="flex flex-col py-2">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors',
                    isActive(href)
                      ? 'bg-[#025CA8]/10 text-[#025CA8]'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              ))}

              {/* Analytics — staff only */}
              {userTier === 'staff' && (
                <>
                  <div className="flex items-center gap-3 px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <BarChart2 className="h-4 w-4 shrink-0" />
                    Analytics
                  </div>
                  {analyticsItems.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'flex items-center gap-3 pl-12 pr-5 py-3 text-sm font-medium transition-colors',
                        isActive(href)
                          ? 'bg-[#025CA8]/10 text-[#025CA8]'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {label}
                    </Link>
                  ))}
                </>
              )}

              {showAdminNav(userRoles) && (
                <Link
                  href="/admin/users"
                  className={cn(
                    'flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors',
                    isActive('/admin')
                      ? 'bg-[#025CA8]/10 text-[#025CA8]'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <ShieldCheck className="h-5 w-5 shrink-0" />
                  Admin
                </Link>
              )}

              {/* Divider */}
              <div className="mx-5 my-2 border-t border-gray-200" />

              <Link
                href="/settings"
                className={cn(
                  'flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors',
                  isActive('/settings')
                    ? 'bg-[#025CA8]/10 text-[#025CA8]'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <UserCircle className="h-5 w-5 shrink-0" />
                Profile &amp; Signature
              </Link>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors w-full text-left"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                Sign out
              </button>

              {/* User info at bottom */}
              <div className="px-5 py-3 border-t border-gray-200 mt-1">
                <p className="text-xs text-gray-500">{userName}</p>
                <p className="text-xs text-gray-700 font-medium mt-0.5">{rolesDisplay(userTier, userRoles)}</p>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
