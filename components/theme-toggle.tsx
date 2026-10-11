'use client'

import { useEffect, useState } from 'react'

// Until someone picks a side, the site follows the operating system. Picking one is
// remembered in localStorage and wins from then on. The matching no-flash script in
// app/layout.tsx applies the same rule before first paint.
const KEY = 'theme'

function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  // null until mounted: the server can't know the viewer's theme, so render nothing rather than a wrong icon.
  const [dark, setDark] = useState<boolean | null>(null)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = () => {
      let chosen: string | null = null
      try { chosen = localStorage.getItem(KEY) } catch {}
      if (chosen) return
      apply(media.matches)
      setDark(media.matches)
    }
    media.addEventListener('change', onSystemChange)
    return () => media.removeEventListener('change', onSystemChange)
  }, [])

  function toggle() {
    const next = !dark
    apply(next)
    setDark(next)
    try { localStorage.setItem(KEY, next ? 'dark' : 'light') } catch {}
  }

  if (dark === null) return <span className={`inline-block h-9 w-9 ${className}`} aria-hidden />

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${className}`}
    >
      {/* Tabler icons: sun / moon (outline). */}
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dark ? (
          <>
            <path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
            <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
          </>
        ) : (
          <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008" />
        )}
      </svg>
    </button>
  )
}
