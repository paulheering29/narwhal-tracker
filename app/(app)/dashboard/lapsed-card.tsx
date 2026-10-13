'use client'

import { useRouter } from 'next/navigation'
import { AlertOctagon, PartyPopper } from 'lucide-react'
import type { LapsedItem } from './lapsed-data'

// Fixed pseudo-random layout so server and client render the same confetti.
const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']
const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  left:   (i * 37) % 100,
  delay:  ((i * 53) % 40) / 10,
  dur:    3 + ((i * 29) % 25) / 10,
  size:   6 + ((i * 7) % 6),
  color:  COLORS[i % COLORS.length],
  round:  i % 3 === 0,
  drift:  ((i * 17) % 40) - 20,
}))

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

export function LapsedCard({ items }: { items: LapsedItem[] }) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6 flex flex-col min-h-[16rem]">
        <style>{`
          @keyframes lapsed-fall {
            0%   { transform: translate3d(0, -20px, 0) rotate(0deg); opacity: 0; }
            10%  { opacity: 1; }
            100% { transform: translate3d(var(--drift), 22rem, 0) rotate(540deg); opacity: 0.9; }
          }
          /* Springy pop-in, like an iMessage landing */
          @keyframes lapsed-pop {
            0%   { transform: scale(0.2) translateY(30px); opacity: 0; }
            55%  { transform: scale(1.18) translateY(-6px); opacity: 1; }
            75%  { transform: scale(0.95) translateY(2px); }
            100% { transform: scale(1) translateY(0); opacity: 1; }
          }
          @keyframes lapsed-wobble {
            0%, 100% { transform: rotate(-6deg); }
            50%      { transform: rotate(6deg); }
          }
          @media (prefers-reduced-motion: reduce) {
            .lapsed-confetti { display: none; }
            .lapsed-pop, .lapsed-wobble { animation: none !important; }
          }
        `}</style>

        {CONFETTI.map((c, i) => (
          <span
            key={i}
            aria-hidden
            className="lapsed-confetti pointer-events-none absolute top-0"
            style={{
              left: `${c.left}%`,
              width: c.size, height: c.round ? c.size : c.size * 1.6,
              backgroundColor: c.color,
              borderRadius: c.round ? '9999px' : 2,
              ['--drift' as string]: `${c.drift}px`,
              animation: `lapsed-fall ${c.dur}s linear ${c.delay}s infinite`,
            }}
          />
        ))}

        <div className="relative flex items-center justify-center mb-4">
          <AlertOctagon className="absolute left-0 h-5 w-5 text-emerald-500" />
          <h3 className="text-base font-bold uppercase tracking-wide text-gray-500">Lapsed</h3>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center text-center">
          <div className="lapsed-pop" style={{ animation: 'lapsed-pop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}>
            <div className="lapsed-wobble" style={{ animation: 'lapsed-wobble 2.4s ease-in-out 0.9s infinite' }}>
              <PartyPopper className="h-14 w-14 text-amber-500" />
            </div>
          </div>
          <p
            className="lapsed-pop mt-3 text-6xl font-extrabold leading-none tabular-nums text-emerald-600"
            style={{ animation: 'lapsed-pop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both' }}
          >
            0
          </p>
          <p
            className="lapsed-pop mt-3 text-sm font-medium text-gray-700"
            style={{ animation: 'lapsed-pop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both' }}
          >
            Nobody has lapsed. Everyone&apos;s current!
          </p>
        </div>
      </div>
    )
  }

  const certs = items.filter(i => i.id.startsWith('cert-')).length
  return (
    <div className="rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6 flex flex-col">
      <div className="relative flex items-center justify-center mb-4">
        <AlertOctagon className="absolute left-0 h-5 w-5 text-rose-500" />
        <h3 className="text-base font-bold uppercase tracking-wide text-gray-500">Lapsed</h3>
      </div>
      <p className="text-center text-6xl font-extrabold leading-none tabular-nums text-rose-600">{items.length}</p>
      <p className="mt-2 text-center text-sm text-gray-600">
        Expired with no renewal in place · {certs} certification{certs === 1 ? '' : 's'}, {items.length - certs} license{items.length - certs === 1 ? '' : 's'}
      </p>
      <ul className="mt-4 -mx-2 max-h-64 overflow-y-auto divide-y divide-gray-100 border-t border-gray-100">
        {items.map(i => (
          <li
            key={i.id}
            onClick={() => router.push(`/staff/${i.staffId}`)}
            className="group cursor-pointer rounded-md px-2 py-2.5 text-sm hover:bg-gray-50"
          >
            <span className="font-medium text-gray-800 group-hover:text-rose-700">{i.name}</span>
            <span className="block text-xs text-gray-400">{i.what} · expired {fmtDate(i.expired)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
