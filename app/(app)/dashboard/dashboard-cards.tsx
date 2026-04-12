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

// Full colour palette per card — kept as literal Tailwind classes so the
// JIT compiler picks them up.
const COLOR_STYLES: Record<CardColor, {
  cardBorder: string
  accentBar:  string
  iconBg:     string
  iconFg:     string
  number:     string
  linkHover:  string
}> = {
  rose: {
    cardBorder: 'border-rose-200',
    accentBar:  'bg-gradient-to-r from-rose-400 to-rose-600',
    iconBg:     'bg-rose-100',
    iconFg:     'text-rose-600',
    number:     'text-rose-600',
    linkHover:  'hover:text-rose-700',
  },
  emerald: {
    cardBorder: 'border-emerald-200',
    accentBar:  'bg-gradient-to-r from-emerald-400 to-emerald-600',
    iconBg:     'bg-emerald-100',
    iconFg:     'text-emerald-600',
    number:     'text-emerald-600',
    linkHover:  'hover:text-emerald-700',
  },
  violet: {
    cardBorder: 'border-violet-200',
    accentBar:  'bg-gradient-to-r from-violet-400 to-violet-600',
    iconBg:     'bg-violet-100',
    iconFg:     'text-violet-600',
    number:     'text-violet-600',
    linkHover:  'hover:text-violet-700',
  },
  blue: {
    cardBorder: 'border-blue-200',
    accentBar:  'bg-gradient-to-r from-blue-400 to-blue-600',
    iconBg:     'bg-blue-100',
    iconFg:     'text-blue-600',
    number:     'text-blue-600',
    linkHover:  'hover:text-blue-700',
  },
  amber: {
    cardBorder: 'border-amber-200',
    accentBar:  'bg-gradient-to-r from-amber-400 to-amber-600',
    iconBg:     'bg-amber-100',
    iconFg:     'text-amber-600',
    number:     'text-amber-600',
    linkHover:  'hover:text-amber-700',
  },
  teal: {
    cardBorder: 'border-teal-200',
    accentBar:  'bg-gradient-to-r from-teal-400 to-teal-600',
    iconBg:     'bg-teal-100',
    iconFg:     'text-teal-600',
    number:     'text-teal-600',
    linkHover:  'hover:text-teal-700',
  },
}

function DashboardCard({ card }: { card: DashboardCardData }) {
  const [expanded, setExpanded] = useState(false)
  const router = useRouter()
  const Icon = ICON_MAP[card.icon]
  const c = COLOR_STYLES[card.color]

  const showList = card.alwaysExpanded || expanded

  return (
    <div className={`rounded-xl border-2 ${c.cardBorder} bg-white shadow-sm overflow-hidden flex flex-col`}>
      {/* Colourful header bar with the title */}
      <div className={`${c.accentBar} px-5 py-4 flex items-center justify-between`}>
        <h3 className="text-lg font-bold uppercase tracking-wide text-white drop-shadow-sm">
          {card.title}
        </h3>
        <div className="rounded-lg p-2 bg-white/25 backdrop-blur-sm">
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {/* Giant centered number */}
        <p className={`text-center font-extrabold leading-none tabular-nums ${c.number} text-7xl sm:text-[10rem]`}>
          {card.value}
        </p>
        <p className="mt-3 text-xs text-gray-500 text-center">{card.description}</p>

        {/* Expand toggle — hidden when alwaysExpanded */}
        {!card.alwaysExpanded && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-4 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors self-start"
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
          <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100 overflow-hidden">
            {card.items.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400 italic">Nothing to show</li>
            ) : (
              card.items.map(item => (
                <li
                  key={item.id}
                  onClick={() => router.push(item.href)}
                  className="flex flex-col px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 transition-colors"
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
              <li className="px-3 py-2 text-xs text-gray-400 italic bg-gray-50">
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
