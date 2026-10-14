'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type CourseAverage = { id: string; name: string; average: number; count: number }

const TABS = [{ key: 'by-course', label: 'By Course' }] as const

export function ReviewsClient({ courses }: { courses: CourseAverage[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('by-course')

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Reviews</h1>
        <p className="mt-1 text-sm text-gray-500">What learners think of your recorded courses</p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              t.key === tab ? 'border-[#025CA8] text-[#025CA8]' : 'border-transparent text-gray-500 hover:text-gray-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'by-course' && (
        <div className="rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6">
          <h2 className="mb-1 text-base font-bold uppercase tracking-wide text-gray-500">Average rating by course</h2>
          <p className="mb-5 text-xs text-gray-400">Out of 5 stars</p>

          {courses.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No reviews yet</p>
          ) : (
            <ul className="space-y-3">
              {courses.map(c => (
                <li key={c.id} className="grid grid-cols-[minmax(0,16rem)_1fr_auto] items-center gap-4">
                  <Link href={`/courses/${c.id}`} className="truncate text-sm text-gray-700 hover:text-[#025CA8]" title={c.name}>
                    {c.name}
                  </Link>
                  <div className="h-5 rounded bg-gray-100">
                    <div className="h-5 rounded bg-amber-400" style={{ width: `${(c.average / 5) * 100}%` }} />
                  </div>
                  <span className="w-24 text-right text-sm tabular-nums text-gray-900">
                    {c.average.toFixed(1)} <span className="text-xs text-gray-400">({c.count})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
