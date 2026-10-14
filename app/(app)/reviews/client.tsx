'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CourseAverage = { id: string; name: string; average: number; count: number }

export type Summary = { course_id: string; summary: string; generated_at: string }

export type Comment = {
  id: string; courseId: string; courseName: string; rating: number
  comment: string; reviewer: string; createdAt: string
}

const TABS = [
  { key: 'by-course', label: 'Average Rating by Course' },
  { key: 'comments', label: 'All Comments' },
  { key: 'summaries', label: 'AI Summaries' },
] as const

export function ReviewsClient({ courses, comments, summaries: initial }: { courses: CourseAverage[]; comments: Comment[]; summaries: Summary[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('by-course')
  const [summaries, setSummaries] = useState(initial)
  const [refreshing, setRefreshing] = useState(true)
  const [courseFilter, setCourseFilter] = useState('')
  const shownComments = courseFilter ? comments.filter(c => c.courseId === courseFilter) : comments

  // Regenerates any summary whose reviews changed; shows the stored ones meanwhile.
  useEffect(() => {
    fetch('/api/reviews/summarize', { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.summaries) setSummaries(d.summaries) })
      .catch(() => {})
      .finally(() => setRefreshing(false))
  }, [])

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

      {tab === 'comments' && (
        <div className="rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-base font-bold uppercase tracking-wide text-gray-500">Reviewer comments</h2>
            <select
              value={courseFilter}
              onChange={e => setCourseFilter(e.target.value)}
              className="max-w-xs rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700"
            >
              <option value="">All courses</option>
              {Array.from(new Map(comments.map(c => [c.courseId, c.courseName])).entries()).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          {shownComments.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No written comments yet</p>
          ) : (
            <div className="space-y-4">
              {shownComments.map(c => (
                <div key={c.id} className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(i => (
                          <Star key={i} className={cn('h-3.5 w-3.5', i <= c.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200')} />
                        ))}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{c.reviewer}</span>
                      <Link href={`/courses/${c.courseId}`} className="text-xs text-gray-400 hover:text-[#025CA8]">{c.courseName}</Link>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">
                      {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{c.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'summaries' && (
        <div className="space-y-4">
          {refreshing && <p className="text-xs text-gray-400">Checking for new reviews…</p>}
          {courses.map(c => {
            const s = summaries.find(x => x.course_id === c.id)
            return (
              <div key={c.id} className="rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6">
                <div className="mb-2 flex items-baseline justify-between gap-4">
                  <Link href={`/courses/${c.id}`} className="text-sm font-semibold text-gray-900 hover:text-[#025CA8]">{c.name}</Link>
                  <span className="text-xs tabular-nums text-gray-400">{c.average.toFixed(1)} · {c.count} review{c.count === 1 ? '' : 's'}</span>
                </div>
                <p className="text-sm text-gray-700">
                  {s ? s.summary : <span className="text-gray-400">{refreshing ? 'Generating…' : 'No written comments to summarize yet.'}</span>}
                </p>
              </div>
            )
          })}
          {courses.length === 0 && !refreshing && <p className="py-8 text-center text-sm text-gray-400">No reviews yet</p>}
        </div>
      )}
    </div>
  )
}
