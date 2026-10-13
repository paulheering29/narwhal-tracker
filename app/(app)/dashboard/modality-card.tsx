'use client'

import { useState } from 'react'
import { DonutCard } from './donut-card'
import { RangeToggle, type Range } from './range-toggle'
import type { ModalityCounts } from './modality-data'

export function ModalityCard({ subtitle, info, counts }: { subtitle: string; info: string; counts: { last30: ModalityCounts; all: ModalityCounts } }) {
  const [range, setRange] = useState<Range>('30')
  const c = range === '30' ? counts.last30 : counts.all

  return (
    <DonutCard
      title="Training Modality"
      info={info}
      subtitle={subtitle}
      centerLabel={range === '30' ? 'trainings, last 30 days' : 'trainings, all time'}
      controls={<RangeToggle value={range} onChange={setRange} />}
      slices={[
        { label: 'Internal Live',     count: c.internalLive,     color: '#14b8a6' },
        { label: 'Internal Recorded', count: c.internalRecorded, color: '#8b5cf6' },
        { label: 'External',          count: c.external,         color: '#f59e0b' },
      ]}
    />
  )
}
