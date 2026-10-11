'use client'

import {
  REGULATION_LABEL, topicFrequencyLabel, fmtLicenseDate,
  type Jurisdiction, type RequirementTopic,
} from '@/lib/licensure'
import { AlertTriangle } from 'lucide-react'

/** What a state requires, in plain terms. Shown when adding a license and on each license card. */
export function LicenseDetails({
  jurisdiction, topics,
}: { jurisdiction: Jurisdiction; topics: RequirementTopic[] }) {
  const rows: [string, string | null][] = [
    ['Type',            REGULATION_LABEL[jurisdiction.regulation_status]],
    ['Renewal cycle',   jurisdiction.cycle_years != null ? `${jurisdiction.cycle_years} year${jurisdiction.cycle_years === 1 ? '' : 's'}` : 'Not yet set'],
    ['Continuing education', jurisdiction.ce_summary],
    ['Ethics',          jurisdiction.ethics_summary],
    ['Supervision',     jurisdiction.supervision_summary],
    ['Other requirements', jurisdiction.other_requirements],
    ['Renewal notes',   jurisdiction.renewal_notes],
  ]
  return (
    <div className="space-y-3 text-sm">
      {jurisdiction.needs_verification && (
        <p className="flex items-start gap-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Details here are marked “confirm with the board”. Check the state’s current rules before relying on them.
        </p>
      )}
      <dl className="space-y-2">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{k}</dt>
            <dd className="text-gray-700">{v}</dd>
          </div>
        ))}
      </dl>
      {topics.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Required topics</p>
          <ul className="space-y-1">
            {topics.map(t => (
              <li key={t.id} className="text-gray-700">
                {t.name}
                <span className="text-gray-400">
                  {' · '}{t.hours != null ? `${Number(t.hours)} hr · ` : ''}{topicFrequencyLabel(t)}
                  {t.counts_toward_ce ? ' · also counts toward CE' : ''}
                </span>
                {t.note && <span className="block text-xs text-gray-400">{t.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-gray-400">
        {jurisdiction.sources && <>Source: {jurisdiction.sources}. </>}
        Rules reviewed {fmtLicenseDate(jurisdiction.last_reviewed)}; rules change, so confirm with the board.
      </p>
    </div>
  )
}
