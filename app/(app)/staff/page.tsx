'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getDisplayName } from '@/lib/display-name'
import { Input } from '@/components/ui/input'
import { Loader2, Search, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffBase = {
  id: string
  first_name: string; last_name: string
  display_first_name: string | null; display_last_name: string | null
  email: string | null; role: string | null; ehr_id: string | null
  active: boolean
}

type StaffRow = StaffBase & {
  cycleStart:   string | null
  cycleEnd:     string | null
  pduDone:      number
  pduScheduled: number
  pctDone:      number   // pduDone / 12
  pctScheduled: number   // (pduDone + pduScheduled) / 12
  pacingTarget: number
  variance:     number   // pduDone - pacingTarget
}

const RBT_TOTAL_PDUS = 12

// ─── Pacing helpers ───────────────────────────────────────────────────────────

function computePacingTarget(startDate: string, endDate: string): number {
  const todayMs = new Date(new Date().toDateString()).getTime()
  const startMs = new Date(startDate + 'T00:00:00').getTime()
  const endMs   = new Date(endDate   + 'T00:00:00').getTime()
  const total   = endMs - startMs
  if (total <= 0) return RBT_TOTAL_PDUS
  const elapsed = Math.max(0, Math.min(total, todayMs - startMs))
  return Math.round((elapsed / total) * RBT_TOTAL_PDUS * 2) / 2
}

function fmtPdu(n: number) { return n % 1 === 0 ? String(n) : n.toFixed(1) }
function fmtPct(n: number) { return `${Math.round(n * 100)}%` }
function fmtVariance(n: number) {
  if (n === 0) return { label: '0', cls: 'text-gray-400' }
  return n > 0
    ? { label: `+${fmtPdu(n)}`, cls: 'text-emerald-600 font-medium' }
    : { label: fmtPdu(n),       cls: 'text-red-500 font-medium' }
}

function fmtCycleDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  const m  = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${m}/${dd}/${dt.getFullYear()}`
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'cycleStart' | 'cycleEnd' | 'pduDone' | 'pctDone' | 'scheduled' | 'pctScheduled' | 'pacingTarget' | 'variance' | 'active'
type SortDir = 'asc' | 'desc'

function getSortValue(s: StaffRow, key: SortKey): number | string {
  switch (key) {
    case 'name':         return getDisplayName(s).toLowerCase()
    case 'cycleStart':   return s.cycleStart  ?? ''
    case 'cycleEnd':     return s.cycleEnd    ?? ''
    case 'pduDone':      return s.pduDone
    case 'pctDone':      return s.pctDone
    case 'scheduled':    return s.pduDone + s.pduScheduled
    case 'pctScheduled': return s.pctScheduled
    case 'pacingTarget': return s.pacingTarget
    case 'variance':     return s.variance
    case 'active':       return s.active ? 1 : 0
  }
}


export default function StaffPage() {
  const supabase = createClient()
  const router = useRouter()

  const [rows, setRows]           = useState<StaffRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')
  const [sortKey, setSortKey]     = useState<SortKey>('name')
  const [sortDir, setSortDir]     = useState<SortDir>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="inline ml-1 h-3 w-3 opacity-30" />
    return sortDir === 'asc'
      ? <ArrowUp   className="inline ml-1 h-3 w-3 text-blue-500" />
      : <ArrowDown className="inline ml-1 h-3 w-3 text-blue-500" />
  }

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [staffRes, cyclesRes, recordsRes] = await Promise.all([
      supabase.from('staff')
        .select('id, first_name, last_name, display_first_name, display_last_name, email, role, ehr_id, active')
        .eq('role', 'RBT')
        .order('last_name'),
      supabase.from('certification_cycles')
        .select('staff_id, start_date, end_date')
        .lte('start_date', today)
        .gte('end_date', today),
      supabase.from('training_records')
        .select('staff_id, completed_date, confirmed, courses(units)'),
    ])

    // Active cycle per staff member
    const cycleMap = new Map<string, { start_date: string; end_date: string }>()
    for (const c of cyclesRes.data ?? []) cycleMap.set(c.staff_id, c)

    // Training records grouped by staff_id
    type TRec = { completed_date: string; confirmed: boolean; units: number }
    const recMap = new Map<string, TRec[]>()
    for (const r of (recordsRes.data ?? []) as unknown as { staff_id: string; completed_date: string; confirmed: boolean; courses: { units: number } | null }[]) {
      const units = r.courses?.units ?? 0
      if (!recMap.has(r.staff_id)) recMap.set(r.staff_id, [])
      recMap.get(r.staff_id)!.push({ completed_date: r.completed_date, confirmed: r.confirmed, units })
    }

    const computed: StaffRow[] = (staffRes.data ?? []).map(s => {
      const cycle = cycleMap.get(s.id) ?? null
      let pduDone = 0, pduScheduled = 0

      if (cycle) {
        for (const r of recMap.get(s.id) ?? []) {
          if (r.completed_date >= cycle.start_date && r.completed_date <= cycle.end_date) {
            if (r.confirmed) pduDone      += r.units
            else             pduScheduled += r.units
          }
        }
      }

      const pacingTarget = cycle ? computePacingTarget(cycle.start_date, cycle.end_date) : 0

      return {
        ...s,
        cycleStart:   cycle?.start_date   ?? null,
        cycleEnd:     cycle?.end_date     ?? null,
        pduDone,
        pduScheduled,
        pctDone:      pduDone / RBT_TOTAL_PDUS,
        pctScheduled: (pduDone + pduScheduled) / RBT_TOTAL_PDUS,
        pacingTarget,
        variance:     pduDone - pacingTarget,
      }
    })

    setRows(computed)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = [...rows
    .filter(s => {
      const display = getDisplayName(s)
      const matchesSearch = `${display} ${s.first_name} ${s.last_name} ${s.email ?? ''} ${s.ehr_id ?? ''}`
        .toLowerCase().includes(search.toLowerCase())
      const matchesActive = filterActive === 'all'
        || (filterActive === 'active' && s.active)
        || (filterActive === 'inactive' && !s.active)
      return matchesSearch && matchesActive
    })
  ].sort((a, b) => {
    const av = getSortValue(a, sortKey)
    const bv = getSortValue(b, sortKey)
    // Rows with no cycle always sink to the bottom
    if (av === '' && bv !== '') return 1
    if (bv === '' && av !== '') return -1
    const cmp = typeof av === 'string'
      ? (av as string).localeCompare(bv as string)
      : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">RBT</h1>
        <p className="mt-1 text-sm text-gray-500">
          {rows.filter(r => r.active).length} active · {rows.filter(r => !r.active).length} inactive · keeping those PDUs on track 🎯
        </p>
      </div>

      <div className="mb-4 flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-md border border-gray-200 overflow-hidden shrink-0">
          {(['active', 'inactive', 'all'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setFilterActive(opt)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors capitalize ${
                filterActive === opt
                  ? 'bg-[#0A253D] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt === 'all' ? 'All' : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-base">
          <colgroup>
            <col className="w-[18%]" />  {/* Name */}
            <col className="w-[9%]" />   {/* Start Date */}
            <col className="w-[9%]" />   {/* End Date */}
            <col className="w-[9%]" />   {/* Completed */}
            <col className="w-[9%]" />   {/* Completed % */}
            <col className="w-[9%]" />   {/* Scheduled */}
            <col className="w-[9%]" />   {/* Scheduled % */}
            <col className="w-[9%]" />   {/* Target */}
            <col className="w-[9%]" />   {/* Variance */}
            <col className="w-[5%]" />   {/* Status */}
            <col className="w-[5%]" />   {/* Arrow */}
          </colgroup>
          <thead>
            {/* ── Group row ── */}
            <tr className="bg-gray-50 border-b border-gray-100 text-sm select-none">
              <th rowSpan={2} className="text-center align-middle font-semibold text-gray-700 px-3 py-2 border-r border-gray-200">
                <button onClick={() => handleSort('name')} className="w-full hover:text-blue-600 transition-colors">
                  Name <SortIcon col="name" />
                </button>
              </th>
              <th colSpan={2} className="text-center font-semibold text-gray-600 px-3 pt-2 pb-0.5 border-r border-gray-200">Cycle Dates</th>
              <th colSpan={2} className="text-center font-semibold text-indigo-600 px-3 pt-2 pb-0.5 border-r border-gray-200">Actual</th>
              <th colSpan={2} className="text-center font-semibold text-amber-600 px-3 pt-2 pb-0.5 border-r border-gray-200">Scheduled</th>
              <th colSpan={2} className="text-center font-semibold text-teal-600 px-3 pt-2 pb-0.5 border-r border-gray-200">Pacing</th>
              <th rowSpan={2} className="w-10 align-middle">
                <button onClick={() => handleSort('active')} className="w-full flex justify-center hover:opacity-70 transition-opacity pt-1">
                  <SortIcon col="active" />
                </button>
              </th>
              <th rowSpan={2} className="w-10 align-middle" />
            </tr>
            {/* ── Column row ── */}
            <tr className="bg-gray-50 border-b border-gray-200 text-sm select-none">
              <th className="px-3 py-1.5">
                <button onClick={() => handleSort('cycleStart')} className="w-full text-center text-gray-500 font-medium hover:text-blue-600 transition-colors">
                  Start Date <SortIcon col="cycleStart" />
                </button>
              </th>
              <th className="px-3 py-1.5 border-r border-gray-200">
                <button onClick={() => handleSort('cycleEnd')} className="w-full text-center text-gray-500 font-medium hover:text-blue-600 transition-colors">
                  End Date <SortIcon col="cycleEnd" />
                </button>
              </th>
              <th className="px-3 py-1.5" title="Confirmed PDUs in active cycle">
                <button onClick={() => handleSort('pduDone')} className="w-full text-center text-indigo-500 font-medium hover:text-blue-600 transition-colors">
                  Completed <SortIcon col="pduDone" />
                </button>
              </th>
              <th className="px-3 py-1.5 border-r border-gray-200" title="PDUs completed / 12">
                <button onClick={() => handleSort('pctDone')} className="w-full text-center text-indigo-500 font-medium hover:text-blue-600 transition-colors">
                  Completed % <SortIcon col="pctDone" />
                </button>
              </th>
              <th className="px-3 py-1.5" title="Completed + scheduled PDUs">
                <button onClick={() => handleSort('scheduled')} className="w-full text-center text-amber-500 font-medium hover:text-blue-600 transition-colors">
                  Scheduled <SortIcon col="scheduled" />
                </button>
              </th>
              <th className="px-3 py-1.5 border-r border-gray-200" title="(Completed + scheduled) / 12">
                <button onClick={() => handleSort('pctScheduled')} className="w-full text-center text-amber-500 font-medium hover:text-blue-600 transition-colors">
                  Scheduled % <SortIcon col="pctScheduled" />
                </button>
              </th>
              <th className="px-3 py-1.5" title="Expected PDUs at this point in cycle">
                <button onClick={() => handleSort('pacingTarget')} className="w-full text-center text-teal-500 font-medium hover:text-blue-600 transition-colors">
                  Target <SortIcon col="pacingTarget" />
                </button>
              </th>
              <th className="px-3 py-1.5 border-r border-gray-200" title="Completed − Target">
                <button onClick={() => handleSort('variance')} className="w-full text-center text-teal-500 font-medium hover:text-blue-600 transition-colors">
                  Variance <SortIcon col="variance" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-gray-400">
                  {search ? 'No staff match your search.' : 'No staff yet. Add your first team member.'}
                </td>
              </tr>
            ) : filtered.map(s => {
              const hasCycle = !!s.cycleStart
              const variance = fmtVariance(s.variance)
              return (
                <tr
                  key={s.id}
                  className={`cursor-pointer hover:bg-gray-50 transition-colors ${!s.active ? 'opacity-50' : ''}`}
                  onClick={() => router.push(`/staff/${s.id}`)}
                >
                  {/* Name */}
                  <td className="text-center px-3 py-3 border-r border-gray-200">
                    <span className="font-semibold text-blue-600 hover:underline">
                      {getDisplayName(s)}
                    </span>
                  </td>

                  {/* Cycle Dates */}
                  <td className="text-center tabular-nums text-gray-500 px-3 py-3">
                    {hasCycle ? fmtCycleDate(s.cycleStart!) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="text-center tabular-nums text-gray-500 px-3 py-3 border-r border-gray-200">
                    {hasCycle ? fmtCycleDate(s.cycleEnd!) : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Actual */}
                  <td className="text-center tabular-nums font-semibold text-indigo-700 px-3 py-3">
                    {hasCycle ? fmtPdu(s.pduDone) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="text-center tabular-nums px-3 py-3 border-r border-gray-200">
                    {hasCycle ? (
                      <span className={s.pctDone >= 1 ? 'text-emerald-600 font-bold' : 'text-indigo-500 font-medium'}>
                        {fmtPct(s.pctDone)}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Scheduled (completed + unconfirmed) */}
                  <td className="text-center tabular-nums font-semibold text-amber-700 px-3 py-3">
                    {hasCycle ? fmtPdu(s.pduDone + s.pduScheduled) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="text-center tabular-nums text-amber-500 font-medium px-3 py-3 border-r border-gray-200">
                    {hasCycle ? fmtPct(s.pctScheduled) : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Pacing */}
                  <td className="text-center tabular-nums text-teal-600 font-medium px-3 py-3">
                    {hasCycle ? fmtPdu(s.pacingTarget) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`text-center tabular-nums font-semibold px-3 py-3 border-r border-gray-200 ${hasCycle ? variance.cls : 'text-gray-300'}`}>
                    {hasCycle ? variance.label : '—'}
                  </td>

                  {/* Status */}
                  <td className="text-center py-3">
                    <span className="text-xs text-gray-400">
                      {s.active ? 'active' : 'inactive'}
                    </span>
                  </td>

                  {/* Navigate */}
                  <td className="text-center py-3">
                    <button
                      className="rounded p-1 hover:bg-gray-100 transition-colors"
                      onClick={e => { e.stopPropagation(); router.push(`/staff/${s.id}`) }}
                    >
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}
