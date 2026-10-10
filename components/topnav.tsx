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
  Settings,
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
  Library as TrainingIcon,
  ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { showAdminNav, canManageTrainings, hasRole, rolesDisplay } from '@/lib/permissions'

interface TopNavProps {
  userTier:   'rbt' | 'staff'
  userRoles:  string[]
  userName:   string
  showMyProgress: boolean
  pendingReviews: number   // outside trainings waiting on this person to review
}

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }

const BG = '#ffffff'

const rbtNavItems: Item[] = [
  { href: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/my-courses',  label: 'My Courses',  icon: GraduationCap   },
]

const analyticsItems: Item[] = [
  { href: '/analytics/topics',        label: 'Topic Analysis', icon: Tag        },
  { href: '/analytics/rbt-insights',  label: 'RBT Insights',   icon: Award      },
  { href: '/analytics/rbt-timeline',  label: 'RBT Timeline',   icon: GitCommitHorizontal },
]

const linkBase = 'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors'
const linkState = (active: boolean) =>
  active ? 'bg-[#025CA8]/10 text-[#025CA8]' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'

function Badge({ n }: { n?: number }) {
  if (!n) return null
  return <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{n}</span>
}

/** A button that opens a small panel of links; closes on outside click and navigation. */
function Dropdown({
  trigger, active, align = 'left', children,
}: {
  trigger: React.ReactNode
  active?: boolean
  align?: 'left' | 'right'
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={cn(linkBase, linkState(!!active))}>
        {trigger}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className={cn(
          'absolute top-full mt-1.5 w-60 rounded-lg bg-white shadow-lg border border-gray-100 py-1 z-50',
          align === 'right' ? 'right-0' : 'left-0',
        )}>
          {children}
        </div>
      )}
    </div>
  )
}

function MenuLink({ href, label, icon: Icon, badge }: Item) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
      <Icon className="h-4 w-4 text-gray-400 shrink-0" />
      <span className="flex-1">{label}</span>
      <Badge n={badge} />
    </Link>
  )
}

export function TopNav({ userTier, userRoles, userName, showMyProgress, pendingReviews }: TopNavProps) {
  const pathname   = usePathname()
  const supabase   = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => setMobileOpen(false), [pathname])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  }

  const isStaff = userTier === 'staff'
  const canReview = isStaff && canManageTrainings(userRoles)

  // What the person does for the company lives in the bar; what they do as a
  // learner (My Courses, My Progress) lives in the account menu.
  const trainingItems: Item[] = [
    { href: '/trainings', label: 'Live Trainings', icon: BookOpen },
    { href: '/courses',   label: 'Video Courses',  icon: PlayCircle },
    ...(canReview ? [{ href: '/outside-trainings', label: 'Outside Training Reviews', icon: ClipboardCheck, badge: pendingReviews }] : []),
  ]
  const myItems: Item[] = isStaff ? [
    { href: '/my-courses', label: 'My Courses', icon: GraduationCap },
    ...(showMyProgress ? [{ href: '/my-progress', label: 'My Progress', icon: Gauge }] : []),
  ] : []
  // The settings page only holds the trainer signature, so only trainers get it.
  const accountItems: Item[] = [
    ...myItems,
    ...(isStaff && hasRole(userRoles, 'Trainer') ? [{ href: '/settings', label: 'Signature', icon: UserCircle }] : []),
  ]

  const trainingActive = trainingItems.some(i => isActive(i.href))

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
            {isStaff ? (
              <>
                <Link href="/dashboard" className={cn(linkBase, linkState(isActive('/dashboard')))}>
                  <LayoutDashboard className="h-4 w-4 shrink-0" /> Dashboard
                </Link>
                <Link href="/staff" className={cn(linkBase, linkState(isActive('/staff')))}>
                  <Users className="h-4 w-4 shrink-0" /> Staff
                </Link>
                <Dropdown
                  active={trainingActive}
                  trigger={<><TrainingIcon className="h-4 w-4 shrink-0" /> Training <Badge n={pendingReviews} /></>}
                >
                  {trainingItems.map(i => <MenuLink key={i.href} {...i} />)}
                </Dropdown>
                <Dropdown
                  active={isActive('/analytics')}
                  trigger={<><BarChart2 className="h-4 w-4 shrink-0" /> Analytics</>}
                >
                  {analyticsItems.map(i => <MenuLink key={i.href} {...i} />)}
                </Dropdown>
                {showAdminNav(userRoles) && (
                  <Link href="/admin/users" className={cn(linkBase, linkState(isActive('/admin') || isActive('/billing')))}>
                    <Settings className="h-4 w-4 shrink-0" /> Settings
                  </Link>
                )}
              </>
            ) : (
              rbtNavItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={cn(linkBase, linkState(isActive(href)))}>
                  <Icon className="h-4 w-4 shrink-0" /> {label}
                </Link>
              ))
            )}
          </nav>

          {/* Desktop: account menu */}
          <div className="hidden lg:block shrink-0 ml-auto">
            <Dropdown
              align="right"
              active={isActive('/settings') || isActive('/my-courses') || isActive('/my-progress')}
              trigger={<><UserCircle className="h-4 w-4 shrink-0" /><span className="max-w-[10rem] truncate">{userName}</span></>}
            >
              <div className="px-3 py-2 border-b border-gray-100 mb-1">
                <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
                <p className="text-xs text-gray-500">{rolesDisplay(userTier, userRoles)}</p>
              </div>
              {accountItems.map(i => <MenuLink key={i.href} {...i} />)}
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 mt-1 transition-colors"
              >
                <LogOut className="h-4 w-4 text-gray-400 shrink-0" /> Sign out
              </button>
            </Dropdown>
          </div>

          {/* Mobile: hamburger button */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="lg:hidden ml-auto relative flex items-center justify-center h-9 w-9 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            {!mobileOpen && pendingReviews > 0 && canReview && <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-amber-500" />}
          </button>

        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute top-14 left-0 right-0 max-h-[calc(100vh-3.5rem)] overflow-y-auto shadow-xl"
            style={{ backgroundColor: BG }}
            onClick={e => e.stopPropagation()}
          >
            <nav className="flex flex-col py-2">
              {(isStaff
                ? [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { href: '/staff', label: 'Staff', icon: Users }]
                : rbtNavItems
              ).map(i => <DrawerLink key={i.href} item={i} active={isActive(i.href)} />)}

              {isStaff && (
                <>
                  <DrawerHeading icon={TrainingIcon}>Training</DrawerHeading>
                  {trainingItems.map(i => <DrawerLink key={i.href} item={i} active={isActive(i.href)} indent />)}

                  <DrawerHeading icon={BarChart2}>Analytics</DrawerHeading>
                  {analyticsItems.map(i => <DrawerLink key={i.href} item={i} active={isActive(i.href)} indent />)}

                  {showAdminNav(userRoles) && (
                    <DrawerLink item={{ href: '/admin/users', label: 'Settings', icon: Settings }} active={isActive('/admin') || isActive('/billing')} />
                  )}
                </>
              )}

              <div className="mx-5 my-2 border-t border-gray-200" />

              {accountItems.map(i => <DrawerLink key={i.href} item={i} active={isActive(i.href)} />)}

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors w-full text-left"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                Sign out
              </button>

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

function DrawerHeading({ icon: Icon, children }: { icon: Item['icon']; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </div>
  )
}

function DrawerLink({ item, active, indent }: { item: Item; active: boolean; indent?: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 pr-5 py-3 text-sm font-medium transition-colors',
        indent ? 'pl-12' : 'pl-5',
        linkState(active),
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="flex-1">{item.label}</span>
      <Badge n={item.badge} />
    </Link>
  )
}
