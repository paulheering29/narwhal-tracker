'use client'

import { useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'

const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
]

// Wide screens show everything in the header; narrow ones (phones) fold it all into a
// hamburger menu so nothing is squeezed or wrapped.
export function MarketingNav({ signupUrl, loginUrl, blue }: { signupUrl: string; loginUrl: string; blue: string }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <nav className="hidden sm:flex items-center gap-6">
        {LINKS.map(l => (
          <a key={l.href} href={l.href} className="text-sm font-medium text-gray-600 hover:text-gray-900">{l.label}</a>
        ))}
        <a href={signupUrl} className="text-sm font-medium text-gray-600 hover:text-gray-900 px-2 py-2">Sign Up Your Org</a>
        <ThemeToggle />
        <a href={loginUrl} className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90" style={{ backgroundColor: blue }}>
          Sign In
        </a>
      </nav>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="sm:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
      >
        {/* Tabler icons: menu-2 / x (outline). */}
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {open ? (
            <>
              <path d="M18 6l-12 12" />
              <path d="M6 6l12 12" />
            </>
          ) : (
            <>
              <path d="M4 6l16 0" />
              <path d="M4 12l16 0" />
              <path d="M4 18l16 0" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div className="sm:hidden absolute left-0 right-0 top-full border-b border-gray-200 bg-white shadow-lg">
          <nav className="flex flex-col px-4 py-3">
            {LINKS.map(l => (
              <a key={l.href} href={l.href} onClick={close} className="py-3 text-base font-medium text-gray-700 hover:text-gray-900">{l.label}</a>
            ))}
            <a href={signupUrl} onClick={close} className="py-3 text-base font-medium text-gray-700 hover:text-gray-900">Sign Up Your Org</a>
            <div className="flex items-center justify-between py-1">
              <span className="text-base font-medium text-gray-700">Light / dark</span>
              <ThemeToggle />
            </div>
            <a href={loginUrl} className="mt-3 rounded-lg px-4 py-3 text-center text-base font-semibold text-white" style={{ backgroundColor: blue }}>
              Sign In
            </a>
          </nav>
        </div>
      )}
    </>
  )
}
