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
  { href: '/dashboard',  label: 'Dashboard', icon: LayoutDashboard },
  { href: '/staff',      label: 'Staff',     icon: Users           },
  { href: '/trainings',  label: 'Trainings', icon: BookOpen        },
]

const rbtNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

const analyticsItems = [
  { href: '/analytics/topics',        label: 'Topic Analysis', icon: Tag        },
  { href: '/analytics/rbt-insights',  label: 'RBT Insights',   icon: Award      },
  { href: '/analytics/rbt-timeline',  label: 'RBT Timeline',   icon: GitCommitHorizontal },
]

export function TopNav({ userTier, userRoles, userEmail }: TopNavProps) {
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

  const navItems = userTier === 'rbt' ? rbtNavItems : staffNavItems

  return (
    <>
      <header style={{ backgroundColor: BG }} className="w-full shrink-0 shadow-md relative z-40">
        <div className="flex h-14 items-center px-4 md:px-6 gap-4">

          {/* Brand */}
          <Link href="/dashboard" className="shrink-0 flex items-center gap-2.5">
            <Image
              src="/narwhal-tracker.jpg"
              alt="Narwhal Tracker"
              width={120}
              height={36}
              className="h-9 w-auto rounded"
              priority
            />
            <span className="text-white font-semibold text-lg leading-none tracking-tight whitespace-nowrap hidden sm:inline">
              Narwhal Tracker
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
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
            )}
          </nav>

          {/* Desktop: user info + profile + sign out */}
          <div className="hidden md:flex items-center gap-3 shrink-0 ml-auto">
            <div className="text-right">
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
              Profile
            </Link>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>

          {/* Mobile: hamburger button */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="md:hidden ml-auto flex items-center justify-center h-9 w-9 rounded-md text-white/80 hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30"
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
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              ))}

              {/* Analytics — staff only */}
              {userTier === 'staff' && (
                <>
                  <div className="flex items-center gap-3 px-5 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">
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
                          ? 'bg-white/20 text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
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
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <ShieldCheck className="h-5 w-5 shrink-0" />
                  Admin
                </Link>
              )}

              {/* Divider */}
              <div className="mx-5 my-2 border-t border-white/20" />

              <Link
                href="/settings"
                className={cn(
                  'flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors',
                  isActive('/settings')
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <UserCircle className="h-5 w-5 shrink-0" />
                Profile &amp; Signature
              </Link>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full text-left"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                Sign out
              </button>

              {/* User info at bottom */}
              <div className="px-5 py-3 border-t border-white/20 mt-1">
                <p className="text-xs text-white/50">{userEmail}</p>
                <p className="text-xs text-white/70 font-medium mt-0.5">{rolesDisplay(userTier, userRoles)}</p>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
