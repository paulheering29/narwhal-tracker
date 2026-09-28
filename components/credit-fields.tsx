'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * The part of a training / course form that says who it earns units for
 * (RBT PDUs, BCBA CEUs, …) and how many of those units are ethics or
 * supervision. Shared by the live-training and streamed-course forms.
 */
export type CreditForm = {
  eligible_credentials: string[]
  ethics_units: string
  supervision_units: string
}

export const emptyCreditForm: CreditForm = {
  eligible_credentials: ['RBT'],
  ethics_units: '',
  supervision_units: '',
}

export function creditFormFrom(row: {
  eligible_credentials?: string[] | null
  ethics_units?: number | null
  supervision_units?: number | null
}): CreditForm {
  return {
    eligible_credentials: row.eligible_credentials ?? ['RBT'],
    ethics_units:      row.ethics_units      ? String(row.ethics_units)      : '',
    supervision_units: row.supervision_units ? String(row.supervision_units) : '',
  }
}

/** Returns an error message, or null when the credit fields are valid. */
export function validateCredit(form: CreditForm, units: string): string | null {
  if (form.eligible_credentials.length === 0) return 'Choose at least one credential this counts for.'
  const total = parseFloat(units) || 0
  if ((parseFloat(form.ethics_units) || 0) > total)      return 'Ethics units can’t be more than the total units.'
  if ((parseFloat(form.supervision_units) || 0) > total) return 'Supervision units can’t be more than the total units.'
  return null
}

export function creditPayload(form: CreditForm) {
  return {
    eligible_credentials: form.eligible_credentials,
    ethics_units:         parseFloat(form.ethics_units)      || 0,
    supervision_units:    parseFloat(form.supervision_units) || 0,
  }
}

type CredentialType = {
  code: string
  unit_label: string
  ethics_units_required: number
  supervision_units_required: number
}

export function CreditFields({ value, onChange }: { value: CreditForm; onChange: (v: CreditForm) => void }) {
  const [types, setTypes] = useState<CredentialType[]>([])

  useEffect(() => {
    createClient()
      .from('credential_types')
      .select('code, unit_label, ethics_units_required, supervision_units_required')
      .order('sort_order')
      .then(({ data }) => setTypes((data ?? []) as CredentialType[]))
  }, [])

  // Ethics / supervision only matter for credentials that require them
  // (BCBA today), so the inputs only appear when one of those is ticked.
  const tracked    = types.filter(t => value.eligible_credentials.includes(t.code))
  const showEthics = tracked.some(t => Number(t.ethics_units_required) > 0)
  const showSuperv = tracked.some(t => Number(t.supervision_units_required) > 0)
  const unitWord   = tracked.find(t => Number(t.ethics_units_required) > 0 || Number(t.supervision_units_required) > 0)?.unit_label ?? 'unit'

  function toggle(code: string) {
    const next = value.eligible_credentials.includes(code)
      ? value.eligible_credentials.filter(c => c !== code)
      : [...value.eligible_credentials, code]
    const stillTracked = types.filter(t => next.includes(t.code))
    onChange({
      eligible_credentials: next,
      // Clear hidden fields so a stale ethics number isn't saved silently.
      ethics_units:      stillTracked.some(t => Number(t.ethics_units_required) > 0)      ? value.ethics_units      : '',
      supervision_units: stillTracked.some(t => Number(t.supervision_units_required) > 0) ? value.supervision_units : '',
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Counts for *</Label>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {types.map(t => (
            <label key={t.code} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={value.eligible_credentials.includes(t.code)}
                onChange={() => toggle(t.code)}
                className="rounded border-gray-300 text-blue-600"
              />
              {t.code} {t.unit_label}s
            </label>
          ))}
        </div>
      </div>
      {(showEthics || showSuperv) && (
        <div className="grid grid-cols-2 gap-4">
          {showEthics && (
            <div className="space-y-2">
              <Label>Ethics {unitWord}s</Label>
              <Input type="number" min="0" step="0.25" placeholder="0"
                value={value.ethics_units} onChange={e => onChange({ ...value, ethics_units: e.target.value })} />
              <p className="text-xs text-gray-400">How many of the total are ethics</p>
            </div>
          )}
          {showSuperv && (
            <div className="space-y-2">
              <Label>Supervision {unitWord}s</Label>
              <Input type="number" min="0" step="0.25" placeholder="0"
                value={value.supervision_units} onChange={e => onChange({ ...value, supervision_units: e.target.value })} />
              <p className="text-xs text-gray-400">How many of the total are supervision</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One-line summary for lists and detail pages, e.g. "2 units · RBT, BCBA · 1 ethics". */
export function creditSummary(row: {
  units: number | null
  eligible_credentials?: string[] | null
  ethics_units?: number | null
  supervision_units?: number | null
}): string {
  if (row.units == null) return '—'
  const parts = [`${row.units} unit${row.units === 1 ? '' : 's'}`]
  if (row.eligible_credentials?.length) parts.push(row.eligible_credentials.join(', '))
  if (row.ethics_units)      parts.push(`${row.ethics_units} ethics`)
  if (row.supervision_units) parts.push(`${row.supervision_units} supervision`)
  return parts.join(' · ')
}
