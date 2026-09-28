'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users,
  CalendarDays,
  AlertTriangle,
  ClipboardCheck,
  BookOpen,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

export type DetailItem = {
  id: string
  label: string
  sublabel?: string
  href: string
  progress?: {
    pct:    number // 0-1
    status: 'done' | 'scheduled' | 'behind'
  }
}

export type CardColor = 'rose' | 'emerald' | 'violet' | 'blue' | 'amber' | 'teal'

export type DashboardCardData = {
  title: string
  value: number
  description: string
  icon: 'users' | 'alert' | 'book' | 'clipboard' | 'calendar' | 'shield'
  color: CardColor
  items: DetailItem[]
  /** When true, the card's detail list is shown without a toggle */
  alwaysExpanded?: boolean
}

const ICON_MAP = {
  users:     Users,
  alert:     AlertTriangle,
  book:      BookOpen,
  clipboard: ClipboardCheck,
  calendar:  CalendarDays,
  shield:    ShieldCheck,
}

// Colour is an accent only (icon + number), on a plain white card — kept as
// literal Tailwind classes so the JIT compiler picks them up.
const COLOR_STYLES: Record<CardColor, { iconFg: string; number: string; linkHover: string }> = {
  rose:    { iconFg: 'text-rose-500',    number: 'text-rose-600',    linkHover: 'group-hover:text-rose-700' },
  emerald: { iconFg: 'text-emerald-500', number: 'text-emerald-600', linkHover: 'group-hover:text-emerald-700' },
  violet:  { iconFg: 'text-violet-500',  number: 'text-violet-600',  linkHover: 'group-hover:text-violet-700' },
  blue:    { iconFg: 'text-blue-500',    number: 'text-blue-600',    linkHover: 'group-hover:text-blue-700' },
  amber:   { iconFg: 'text-amber-500',   number: 'text-amber-600',   linkHover: 'group-hover:text-amber-700' },
  teal:    { iconFg: 'text-teal-500',    number: 'text-teal-600',    linkHover: 'group-hover:text-teal-700' },
}

function DashboardCard({ card }: { card: DashboardCardData }) {
  const [expanded, setExpanded] = useState(false)
  const router = useRouter()
  const Icon = ICON_MAP[card.icon]
  const c = COLOR_STYLES[card.color]

  const showList = card.alwaysExpanded || expanded

  return (
    <div className="rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-5 w-5 ${c.iconFg}`} />
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">{card.title}</h3>
      </div>

      <p className={`text-6xl font-extrabold leading-none tabular-nums ${c.number}`}>
        {card.value}
      </p>
      <p className="mt-2 text-sm text-gray-600">{card.description}</p>

      <div className="flex-1 flex flex-col">
        {/* Expand toggle — hidden when alwaysExpanded */}
        {!card.alwaysExpanded && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-4 flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors self-start"
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5" /> Hide list</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" /> Show list</>
            )}
          </button>
        )}

        {/* Detail list */}
        {showList && (
          <ul className="mt-4 -mx-2 divide-y divide-gray-100 border-t border-gray-100">
            {card.items.length === 0 ? (
              <li className="px-2 py-3 text-sm text-gray-400">Nothing to show</li>
            ) : (
              card.items.map(item => (
                <li
                  key={item.id}
                  onClick={() => router.push(item.href)}
                  className="group flex flex-col px-2 py-2.5 text-sm cursor-pointer rounded-md hover:bg-gray-50 transition-colors"
                >
                  <span className={`font-medium text-gray-800 ${c.linkHover}`}>
                    {item.label}
                  </span>
                  {item.sublabel && (
                    <span className="text-xs text-gray-400">{item.sublabel}</span>
                  )}
                  {item.progress && (
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.progress.status === 'done'      ? 'bg-emerald-500' :
                          item.progress.status === 'scheduled' ? 'bg-emerald-300' :
                                                                 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.max(2, item.progress.pct * 100)}%` }}
                      />
                    </div>
                  )}
                </li>
              ))
            )}
            {card.value > 25 && (
              <li className="px-2 py-2.5 text-xs text-gray-400">
                Showing first 25 of {card.value}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

export function DashboardCards({ cards }: { cards: DashboardCardData[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(card => (
        <DashboardCard key={card.title} card={card} />
      ))}
    </div>
  )
}
