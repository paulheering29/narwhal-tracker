'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { VerificationBadge, needsAttention } from '@/components/verification-badge'
import {
  STATUS_LABEL, bacbEndsBeforeLicense, daysLabel, daysUntil, expiryPill, fmtLicenseDate,
  type Jurisdiction, type RequirementTopic, type StaffLicense,
} from '@/lib/licensure'
import { computeCeProgress, computeTopicStatuses, type TopicCompletion, type UnitEvent } from '@/lib/licensure-progress'
import { AlertTriangle, Search } from 'lucide-react'

type Person = { id: string; name: string; active: boolean }

/**
 * Company-wide view of state licenses: one row per person per state, soonest
 * expiry first. People with several licenses appear once for each.
 */
export function LicenseTable({
  people, licenses, jurisdictions, bacbEnd, events, topics, completions, coveredStates,
}: {
  people: Person[]
  licenses: StaffLicense[]
  jurisdictions: Jurisdiction[]
  bacbEnd: Record<string, string>   // staff_id → end of their current BACB cycle
  events: Record<string, UnitEvent[]>
  topics: RequirementTopic[]
  completions: TopicCompletion[]
  coveredStates: Set<string>   // states whose list we download, so a license there is auto-checked
}) {
  const [search, setSearch] = useState('')
  const [window, setWindow] = useState<'all' | '90' | 'expired' | 'attention'>('all')

  const byCode = new Map(jurisdictions.map(j => [j.code, j]))
  const byPerson = new Map(people.map(p => [p.id, p]))

  const rows = licenses
    .filter(l => byPerson.has(l.staff_id))
    .map(l => ({ l, person: byPerson.get(l.staff_id)!, j: byCode.get(l.jurisdiction_code), days: daysUntil(l.expiration_date) }))
    .filter(r => {
      const hay = `${r.person.name} ${r.j?.name ?? ''} ${r.l.jurisdiction_code} ${r.l.license_number ?? ''}`.toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
      if (window === '90') return r.days >= 0 && r.days <= 90
      if (window === 'expired') return r.days < 0
      if (window === 'attention') return needsAttention(r.l)
      return true
    })
    .sort((a, b) => a.l.expiration_date.localeCompare(b.l.expiration_date))

  const all = licenses.filter(l => byPerson.has(l.staff_id))
  const soon = all.filter(l => { const d = daysUntil(l.expiration_date); return d >= 0 && d <= 90 }).length
  const expired = all.filter(l => daysUntil(l.expiration_date) < 0).length
  const attention = all.filter(needsAttention).length
  const withoutLicense = people.filter(p => p.active && !licenses.some(l => l.staff_id === p.id)).length

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
        {[
          { label: 'Licenses', value: all.length, cls: 'text-gray-900' },
          { label: 'Expiring in 90 days', value: soon, cls: soon ? 'text-amber-600' : 'text-gray-900' },
          { label: 'Expired', value: expired, cls: expired ? 'text-red-600' : 'text-gray-900' },
          { label: 'Failed state check', value: attention, cls: attention ? 'text-red-600' : 'text-gray-900' },
        ].map(s => (
          <div key={s.label} className="rounded-lg border bg-white px-4 py-3 shadow-sm">
            <p className={`text-2xl font-bold tabular-nums ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search by name, state or license number…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex rounded-md border border-gray-200 overflow-hidden shrink-0">
          {([['all', 'All'], ['90', 'Next 90 days'], ['expired', 'Expired'], ['attention', 'Needs attention']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setWindow(key)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${window === key ? 'bg-[#025CA8] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5">Person</th>
              <th className="px-3 py-2.5">State</th>
              <th className="px-3 py-2.5">License #</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Expires</th>
              <th className="px-3 py-2.5">State check</th>
              <th className="px-3 py-2.5">Time left</th>
              <th className="px-3 py-2.5">State CE</th>
              <th className="px-3 py-2.5">Topics</th>
              <th className="px-3 py-2.5">BACB</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="py-12 text-center text-gray-400">
                {all.length === 0 ? 'No state licenses on file yet. Add them from a BCBA’s profile.' : 'No licenses match.'}
              </td></tr>
            ) : rows.map(({ l, person, j, days }) => {
              const bacbShort = bacbEndsBeforeLicense(l, j, bacbEnd[l.staff_id])
              const progress = computeCeProgress(l, j, events[l.staff_id] ?? [], !!bacbEnd[l.staff_id])
              const statuses = computeTopicStatuses(l, j, topics.filter(t => t.jurisdiction_code === l.jurisdiction_code), completions)
              const due = statuses.filter(t => !t.done).length
              return (
                <tr key={l.id} className={!person.active ? 'opacity-50' : ''}>
                  <td className="px-4 py-2.5">
                    <Link href={`/staff/${person.id}`} className="font-semibold text-blue-600 hover:underline">{person.name}</Link>
                  </td>
                  <td className="px-3 py-2.5 text-gray-800">{j?.name ?? l.jurisdiction_code}</td>
                  <td className="px-3 py-2.5 text-gray-500 tabular-nums">{l.license_number ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{STATUS_LABEL[l.status]}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-600">
                    {fmtLicenseDate(l.expiration_date)}
                    {l.verification_result && l.state_expiration && l.state_expiration !== l.expiration_date && (
                      <span className="block text-xs font-medium text-amber-700">State: {fmtLicenseDate(l.state_expiration)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5"><VerificationBadge license={l} covered={coveredStates.has(l.jurisdiction_code)} /></td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${expiryPill(days)}`}>{daysLabel(days)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {progress ? (
                      <span className={`tabular-nums font-medium ${progress.complete ? 'text-emerald-600' : 'text-gray-700'}`}>
                        {progress.exempt ? 'Exempt' : progress.metByBacb ? 'Met via BACB'
                          : <>{Number(progress.done.toFixed(2))} / {Number(progress.required.toFixed(2))}{progress.ethicsRequired > 0 && <span className="text-gray-400"> · ethics {Number(progress.ethicsDone.toFixed(2))}/{Number(progress.ethicsRequired.toFixed(2))}</span>}</>}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {statuses.length === 0 ? <span className="text-gray-300">—</span>
                      : due > 0 ? <span className="font-medium text-amber-700">{due} due</span>
                      : <span className="text-emerald-600">All done</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {bacbShort ? (
                      <span className="inline-flex items-center gap-1 text-amber-700" title="This license requires an active BACB certification, which ends first.">
                        <AlertTriangle className="h-3.5 w-3.5" /> Ends {fmtLicenseDate(bacbShort)}
                      </span>
                    ) : j?.tied_to_bacb ? (
                      <span className="text-gray-500">Required</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {withoutLicense > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          {withoutLicense} active BCBA{withoutLicense !== 1 ? 's have' : ' has'} no state license on file. That’s normal for BCBAs who practice only in states that don’t license BCBAs.
        </p>
      )}
    </div>
  )
}
