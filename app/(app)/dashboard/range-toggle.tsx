'use client'

export type Range = '30' | 'all'

export function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="mx-auto inline-flex rounded-full bg-gray-100 p-0.5 text-xs font-medium">
      {([['30', 'Last 30 days'], ['all', 'All time']] as const).map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded-full px-3 py-1 transition-colors ${value === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
