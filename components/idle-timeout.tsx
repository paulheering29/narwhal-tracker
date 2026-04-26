'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const IDLE_MS      = 60 * 60 * 1000  // 1 hour
const WARN_BEFORE  = 5  * 60 * 1000  // warn 5 minutes before logout
const WARN_MS      = IDLE_MS - WARN_BEFORE

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const

export function IdleTimeout() {
  const supabase     = createClient()
  const idleTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [warning, setWarning] = useState(false)
  const [countdown, setCountdown] = useState(WARN_BEFORE / 1000)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function resetTimers() {
    // Cancel existing timers
    if (idleTimer.current)   clearTimeout(idleTimer.current)
    if (warnTimer.current)   clearTimeout(warnTimer.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setWarning(false)

    // Warn at WARN_MS
    warnTimer.current = setTimeout(() => {
      setWarning(true)
      setCountdown(WARN_BEFORE / 1000)
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current)
            return 0
          }
          return c - 1
        })
      }, 1000)
    }, WARN_MS)

    // Sign out at IDLE_MS
    idleTimer.current = setTimeout(signOut, IDLE_MS)
  }

  function handleActivity() {
    // Only reset if we're not already in the warning window
    if (!warning) resetTimers()
  }

  useEffect(() => {
    resetTimers()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
    return () => {
      if (idleTimer.current)    clearTimeout(idleTimer.current)
      if (warnTimer.current)    clearTimeout(warnTimer.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep handleActivity up to date with warning state
  useEffect(() => {
    ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity))
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
    return () => ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warning])

  if (!warning) return null

  const mins = Math.floor(countdown / 60)
  const secs = countdown % 60
  const timeLabel = mins > 0
    ? `${mins}:${String(secs).padStart(2, '0')}`
    : `${secs}s`

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="rounded-xl bg-[#0A253D] text-white shadow-xl px-5 py-4 flex flex-col gap-3">
        <div>
          <p className="font-semibold text-sm">Session expiring soon</p>
          <p className="text-xs text-white/70 mt-0.5">
            You&apos;ll be logged out in <span className="font-mono font-bold text-white">{timeLabel}</span> due to inactivity.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { resetTimers() }}
            className="flex-1 rounded-lg bg-white text-[#0A253D] text-sm font-semibold py-2 hover:bg-white/90 transition-colors"
          >
            Stay logged in
          </button>
          <button
            onClick={signOut}
            className="rounded-lg bg-white/10 text-white text-sm font-medium py-2 px-4 hover:bg-white/20 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
