'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { InfoTip } from './info-tip'
import { RangeToggle, type Range } from './range-toggle'

export type ReviewPoint = { rating: number; createdAt: string }

// One star filled by `fill` (0-1): a gray star with an amber one clipped on top.
function PartialStar({ fill }: { fill: number }) {
  return (
    <span className="relative inline-block h-7 w-7">
      <Star className="absolute inset-0 h-7 w-7 text-gray-200" />
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
        <Star className="h-7 w-7 fill-amber-400 text-amber-400" />
      </span>
    </span>
  )
}

export function RatingCard({ reviews }: { reviews: ReviewPoint[] }) {
  const [range, setRange] = useState<Range>('30')

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const scoped = range === 'all' ? reviews : reviews.filter(r => new Date(r.createdAt).getTime() >= cutoff)
  const average = scoped.length ? scoped.reduce((n, r) => n + r.rating, 0) / scoped.length : null

  return (
    <div className="rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6 flex flex-col">
      <div className="relative flex items-center justify-center mb-4">
        <Star className="absolute left-0 h-5 w-5 text-amber-500" />
        <h3 className="text-base font-bold uppercase tracking-wide text-gray-500">Course Rating</h3>
        <InfoTip text="Average star rating (1-5) learners gave recorded courses, across all courses. Use the toggle for the last 30 days or all time." />
      </div>

      <RangeToggle value={range} onChange={setRange} />

      <p className="mt-5 text-center text-6xl font-extrabold leading-none tabular-nums text-gray-900">
        {average === null ? '—' : average.toFixed(1)}
      </p>
      <div className="mt-3 flex justify-center gap-1" aria-label={average === null ? 'No ratings' : `${average.toFixed(1)} out of 5 stars`}>
        {[0, 1, 2, 3, 4].map(i => (
          <PartialStar key={i} fill={average === null ? 0 : Math.max(0, Math.min(1, average - i))} />
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        {scoped.length === 0 ? 'No reviews yet' : `${scoped.length} review${scoped.length === 1 ? '' : 's'}`}
      </p>
    </div>
  )
}
