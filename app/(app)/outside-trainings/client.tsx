'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getDisplayName } from '@/lib/display-name'
import { ReviewBadge } from '@/components/outside-trainings'
import type { OutsideTraining } from '@/lib/outside-trainings'
import { Ban, Check, ExternalLink, Loader2 } from 'lucide-react'

export type QueueRow = OutsideTraining & {
  created_at: string
  unitLabel: string
  staff: {
    id: string; role: string | null
    first_name: string; last_name: string
    display_first_name: string | null; display_last_name: string | null
  } | null
}

type Filter = 'pending' | 'not_approved' | 'approved' | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending',      label: 'Pending' },
  { key: 'not_approved', label: 'Not approved' },
  { key: 'approved',     label: 'Approved' },
  { key: 'all',          label: 'All' },
]

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}
function fmtNum(n: number) { return n % 1 === 0 ? String(n) : String(Number(n.toFixed(2))) }

export function ReviewQueueClient({ rows, myStaffId }: { rows: QueueRow[]; myStaffId: string }) {
  const supabase = createClient()
  const router   = useRouter()
  const [filter, setFilter]           = useState<Filter>('pending')
  const [busyId, setBusyId]           = useState<string | null>(null)
  const [openingId, setOpeningId]     = useState<string | null>(null)

  const counts: Record<Filter, number> = {
    pending:      rows.filter(r => r.review_status === 'pending').length,
    not_approved: rows.filter(r => r.review_status === 'not_approved').length,
    approved:     rows.filter(r => r.review_status === 'approved').length,
    all:          rows.length,
  }
  const shown = filter === 'all' ? rows : rows.filter(r => r.review_status === filter)

  async function setStatus(r: QueueRow, status: OutsideTraining['review_status']) {
    setBusyId(r.id)
    await supabase.from('external_trainings').update({ review_status: status }).eq('id', r.id)
    setBusyId(null)
    router.refresh()
  }

  async function viewCertificate(r: QueueRow) {
    if (!r.certificate_path) return
    const win = window.open('', '_blank')   // synchronous, so Safari allows it
    setOpeningId(r.id)
    const { data } = await supabase.storage.from('cert-cycle-documents').createSignedUrl(r.certificate_path, 300)
    setOpeningId(null)
    if (data?.signedUrl && win) win.location.href = data.signedUrl
    else win?.close()
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Outside Training Reviews</h1>
        <p className="mt-1 text-sm text-gray-500">
          Trainings people added from outside the company. Pending ones count until you mark them not approved.
        </p>
      </div>

      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              filter === f.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {f.label}
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-gray-400">
          {filter === 'pending' ? 'Nothing waiting for review.' : 'Nothing here.'}
        </div>
      ) : (
        <ul className="rounded-lg border bg-white shadow-sm divide-y divide-gray-100">
          {shown.map(r => {
            const units = `${r.unitLabel}s`
            const isMine = r.staff?.id === myStaffId
            return (
              <li key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.staff && (
                      <Link href={`/staff/${r.staff.id}`} className="text-sm font-semibold text-blue-600 hover:underline">
                        {getDisplayName(r.staff)}
                      </Link>
                    )}
                    {r.staff?.role && <span className="text-xs text-gray-400">{r.staff.role}</span>}
                    <ReviewBadge status={r.review_status} />
                  </div>
                  <p className="mt-0.5 text-sm text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-500">
                    {fmtDate(r.completed_date)}
                    {r.provider && <> · {r.provider}</>}
                    {' · '}{fmtNum(r.units)} {units}
                    {r.ethics_units      > 0 && <> · {fmtNum(r.ethics_units)} ethics</>}
                    {r.supervision_units > 0 && <> · {fmtNum(r.supervision_units)} supervision</>}
                  </p>
                  {r.notes && <p className="mt-1 text-xs text-gray-500 italic">{r.notes}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {r.certificate_path ? (
                    <button onClick={() => viewCertificate(r)}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                      {openingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      Certificate
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">No certificate</span>
                  )}
                  {isMine ? (
                    <span className="text-xs text-gray-400" title="Someone else on your team needs to review this">Your own entry</span>
                  ) : busyId === r.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  ) : (
                    <>
                      {r.review_status !== 'approved' && (
                        <button onClick={() => setStatus(r, 'approved')}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                      )}
                      {r.review_status !== 'not_approved' && (
                        <button onClick={() => setStatus(r, 'not_approved')}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200">
                          <Ban className="h-3.5 w-3.5" /> Not approved
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
