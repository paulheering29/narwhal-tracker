'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, CalendarDays, AlertTriangle, ClipboardCheck, ChevronDown, ChevronUp } from 'lucide-react'

export type DetailItem = {
  id: string
  label: string
  sublabel?: string
  href: string
}

export type DashboardCardData = {
  title: string
  value: number
  description: string
  icon: 'users' | 'alert' | 'book' | 'clipboard'
  iconClass: string
  bgClass: string
  items: DetailItem[]
}

const ICON_MAP = {
  users:     Users,
  alert:     AlertTriangle,
  book:      CalendarDays,
  clipboard: ClipboardCheck,
}

function DashboardCard({ card }: { card: DashboardCardData }) {
  const [expanded, setExpanded] = useState(false)
  const router = useRouter()
  const Icon = ICON_MAP[card.icon]

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{card.title}</CardTitle>
        <div className={`rounded-lg p-2 ${card.bgClass}`}>
          <Icon className={`h-5 w-5 ${card.iconClass}`} />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-6xl font-bold text-gray-900">{card.value}</p>
        <p className="mt-1 text-xs text-gray-500">{card.description}</p>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-3 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {expanded ? (
            <><ChevronUp className="h-3.5 w-3.5" /> Hide list</>
          ) : (
            <><ChevronDown className="h-3.5 w-3.5" /> Show list</>
          )}
        </button>

        {/* Expanded list */}
        {expanded && (
          <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100 overflow-hidden">
            {card.items.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400 italic">Nothing to show</li>
            ) : (
              card.items.map(item => (
                <li
                  key={item.id}
                  onClick={() => router.push(item.href)}
                  className="flex flex-col px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-blue-600 hover:underline">{item.label}</span>
                  {item.sublabel && (
                    <span className="text-xs text-gray-400">{item.sublabel}</span>
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
      </CardContent>
    </Card>
  )
}

export function DashboardCards({ cards }: { cards: DashboardCardData[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => (
        <DashboardCard key={card.title} card={card} />
      ))}
    </div>
  )
}
