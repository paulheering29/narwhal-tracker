import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { InfoTip } from './info-tip'

export type UnconfirmedTraining = { id: string; name: string; date: string; unconfirmed: number }

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

export function UnconfirmedCard({ trainings, staffCount }: { trainings: UnconfirmedTraining[]; staffCount: number }) {
  return (
    <div className="rounded-xl border-2 border-gray-100 bg-white shadow-sm p-6 flex flex-col">
      <div className="relative flex items-center justify-center mb-4">
        <ClipboardCheck className="absolute left-0 h-5 w-5 text-amber-500" />
        <h3 className="text-base font-bold uppercase tracking-wide text-gray-500">Unconfirmed</h3>
        <InfoTip text="Past live trainings where at least one registered person is still pending: not yet confirmed as attended and not marked a no-show. Open the training to settle them." />
      </div>
      <p className="-mt-3 mb-3 text-center text-xs text-gray-400">Past live trainings awaiting attendance confirmation</p>

      <div className="grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-5xl font-extrabold leading-none tabular-nums text-amber-600">{trainings.length}</p>
          <p className="mt-1 text-xs text-gray-500">trainings</p>
        </div>
        <div>
          <p className="text-5xl font-extrabold leading-none tabular-nums text-amber-600">{staffCount}</p>
          <p className="mt-1 text-xs text-gray-500">staff</p>
        </div>
      </div>

      <ul className="mt-4 -mx-2 max-h-64 overflow-y-auto divide-y divide-gray-100 border-t border-gray-100">
        {trainings.length === 0 ? (
          <li className="px-2 py-3 text-sm text-gray-400">All past trainings are confirmed</li>
        ) : (
          trainings.map(t => (
            <li key={t.id}>
              <Link href={`/trainings/${t.id}`} className="block rounded-md px-2 py-2.5 text-sm hover:bg-gray-50">
                <span className="font-medium text-gray-800">{t.name}</span>
                <span className="block text-xs text-gray-400">
                  {fmtDate(t.date)} · {t.unconfirmed} unconfirmed
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
