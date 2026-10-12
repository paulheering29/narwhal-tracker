'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IDLE_COOKIE, parseIdleCookie } from '@/lib/idle'

const WARN_BEFORE_MS = 2 * 60 * 1000   // show the "stay logged in" prompt this long before sign-out
const CHECK_EVERY_MS = 5 * 1000
const WRITE_EVERY_MS = 5 * 1000        // activity events fire constantly; don't rewrite the cookie on each one

// Embedded players (course videos) swallow mouse and key events, so they announce themselves with this.
export const ACTIVITY_EVENT = 'tl:activity'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', ACTIVITY_EVENT] as const

function readLast(): number | null {
  const match = document.cookie.split('; ').find(c => c.startsWith(`${IDLE_COOKIE}=`))
  return parseIdleCookie(match?.slice(IDLE_COOKIE.length + 1))?.last ?? null
}

export function IdleTimeout({ minutes }: { minutes: number }) {
  const supabase = createClient()
  const idleMs   = minutes * 60 * 1000
  const lastWrite = useRef(0)
  const [remaining, setRemaining] = useState<number | null>(null)   // ms left, only set inside the warning window

  // The cookie is the source of truth so every tab, and the middleware, agree on when you were last active.
  const touch = useCallback(() => {
    lastWrite.current = Date.now()
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${IDLE_COOKIE}=${Date.now()}:${minutes}; path=/; max-age=31536000; SameSite=Lax${secure}`
  }, [minutes])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' })
    document.cookie = `${IDLE_COOKIE}=; path=/; max-age=0`
    window.location.href = '/login?notice=idle'
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const check = useCallback(() => {
    const left = (readLast() ?? Date.now()) + idleMs - Date.now()
    if (left <= 0) { signOut(); return }
    setRemaining(left <= WARN_BEFORE_MS ? left : null)
  }, [idleMs, signOut])

  useEffect(() => {
    // Coming back to a laptop that slept: if the window has passed, sign out before anything else runs.
    const last = readLast()
    if (last !== null && Date.now() - last >= idleMs) { signOut(); return }
    touch()

    // Once the warning is up, activity must not silently extend the session; only the button does.
    function onActivity() {
      if (Date.now() - lastWrite.current < WRITE_EVERY_MS) return
      const left = (readLast() ?? Date.now()) + idleMs - Date.now()
      if (left > WARN_BEFORE_MS) touch()
    }

    const timer = setInterval(check, CHECK_EVERY_MS)
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', check)
    }
  }, [idleMs, touch, check, signOut])

  if (remaining === null) return null

  // Counts down between the 5s checks.
  return <Warning remaining={remaining} onStay={() => { touch(); setRemaining(null) }} onLogout={signOut} />
}

function Warning({ remaining, onStay, onLogout }: { remaining: number; onStay: () => void; onLogout: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(remaining / 1000))
  useEffect(() => {
    setSecondsLeft(Math.ceil(remaining / 1000))
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [remaining])

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const timeLabel = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="rounded-xl bg-[#025CA8] text-white shadow-xl px-5 py-4 flex flex-col gap-3">
        <div>
          <p className="font-semibold text-sm">Session expiring soon</p>
          <p className="text-xs text-white/70 mt-0.5">
            You&apos;ll be logged out in <span className="font-mono font-bold text-white">{timeLabel}</span> due to inactivity.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onStay}
            className="flex-1 rounded-lg bg-white text-[#025CA8] text-sm font-semibold py-2 hover:bg-white/90 transition-colors"
          >
            Stay logged in
          </button>
          <button
            onClick={onLogout}
            className="rounded-lg bg-white/10 text-white text-sm font-medium py-2 px-4 hover:bg-white/20 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
