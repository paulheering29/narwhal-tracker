'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { LicenseDetails } from '@/components/license-details'
import { CeProgressView, TopicChecklist } from '@/components/license-progress'
import { LicenseDocuments } from '@/components/license-documents'
import { VerificationBadge } from '@/components/verification-badge'
import {
  COMPLETION_COLUMNS, computeCeProgress, computeTopicStatuses, loadUnitEvents,
  type TopicCompletion, type UnitEvent,
} from '@/lib/licensure-progress'
import {
  JURISDICTION_COLUMNS, LICENSE_COLUMNS, STATUS_LABEL, bacbEndsBeforeLicense, daysLabel, daysUntil,
  expiryPill, fmtLicenseDate,
  type Jurisdiction, type LicenseStatus, type RequirementTopic, type StaffLicense,
} from '@/lib/licensure'
import { AlertTriangle, ChevronDown, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

const emptyForm = {
  jurisdiction_code: '', license_number: '', status: 'active' as LicenseStatus,
  issued_date: '', expiration_date: '', notes: '',
  ce_exempt_this_cycle: false, ce_hours_override: '', ce_period_end: '',
}

/**
 * One person's state licenses. Only admins, trainers and account owners can
 * change them (the database enforces that too); everyone else, including the
 * BCBA themselves, sees them read-only.
 */
export function StaffLicenses({
  staffId, bacb,
}: {
  staffId: string
  /** When given (a BCBA viewing their own certifications), the BACB certification is listed alongside the licenses. */
  bacb?: { endDate: string | null }
}) {
  const supabase = createClient()

  const [licenses, setLicenses]         = useState<StaffLicense[]>([])
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([])
  const [topics, setTopics]             = useState<RequirementTopic[]>([])
  const [bacbEnd, setBacbEnd]           = useState<string | null>(null)
  const [events, setEvents]             = useState<UnitEvent[]>([])
  const [completions, setCompletions]   = useState<TopicCompletion[]>([])
  const [loading, setLoading]           = useState(true)
  const [expanded, setExpanded]         = useState<string | null>(null)
  const [canEdit, setCanEdit]           = useState(false)

  const [open, setOpen]       = useState(false)
  const [editing, setEditing] = useState<StaffLicense | null>(null)
  const [form, setForm]       = useState(emptyForm)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const roles = (user?.app_metadata?.roles ?? []) as string[]
    setCanEdit(roles.some(r => ['Admin', 'Trainer', 'Account Owner'].includes(r)))
    const today = new Date().toISOString().split('T')[0]
    const [licRes, jurRes, topicRes, cycleRes] = await Promise.all([
      supabase.from('staff_licenses').select(LICENSE_COLUMNS).eq('staff_id', staffId).order('expiration_date'),
      supabase.from('license_jurisdictions').select(JURISDICTION_COLUMNS).order('name'),
      supabase.from('license_requirement_topics').select('*'),
      supabase.from('certification_cycles').select('end_date').eq('staff_id', staffId).eq('certification_type', 'BCBA')
        .gte('end_date', today).order('end_date').limit(1),
    ])
    const lics = (licRes.data ?? []) as StaffLicense[]
    setLicenses(lics)
    const [eventMap, compRes] = await Promise.all([
      loadUnitEvents(supabase, [staffId]),
      lics.length
        ? supabase.from('staff_license_topic_completions').select(COMPLETION_COLUMNS).in('license_id', lics.map(l => l.id))
        : Promise.resolve({ data: [] }),
    ])
    setEvents(eventMap[staffId] ?? [])
    setCompletions((compRes.data ?? []) as TopicCompletion[])
    setJurisdictions((jurRes.data ?? []) as unknown as Jurisdiction[])
    setTopics((topicRes.data ?? []) as RequirementTopic[])
    setBacbEnd(cycleRes.data?.[0]?.end_date ?? null)
    setLoading(false)
  }, [staffId])

  useEffect(() => { load() }, [load])

  const byCode = useMemo(() => new Map(jurisdictions.map(j => [j.code, j])), [jurisdictions])
  const usedCodes = new Set(licenses.map(l => l.jurisdiction_code))
  const formJurisdiction = form.jurisdiction_code ? byCode.get(form.jurisdiction_code) : undefined

  function openAdd() {
    setEditing(null); setForm(emptyForm); setError(null); setOpen(true)
  }
  function openEdit(l: StaffLicense) {
    setEditing(l)
    setForm({
      jurisdiction_code: l.jurisdiction_code, license_number: l.license_number ?? '', status: l.status,
      issued_date: l.issued_date ?? '', expiration_date: l.expiration_date, notes: l.notes ?? '',
      ce_exempt_this_cycle: l.ce_exempt_this_cycle, ce_hours_override: l.ce_hours_override != null ? String(l.ce_hours_override) : '',
      ce_period_end: l.ce_period_end ?? '',
    })
    setError(null); setOpen(true)
  }

  async function handleSave() {
    if (!form.jurisdiction_code) { setError('Choose a state.'); return }
    if (!form.expiration_date)   { setError('Enter the expiration date.'); return }
    if (form.issued_date && form.issued_date > form.expiration_date) { setError('The issue date must be before the expiration date.'); return }
    setSaving(true); setError(null)
    const row = {
      license_number:  form.license_number.trim() || null,
      status:          form.status,
      issued_date:     form.issued_date || null,
      expiration_date: form.expiration_date,
      notes:           form.notes.trim() || null,
      ce_exempt_this_cycle: form.ce_exempt_this_cycle,
      ce_hours_override:    form.ce_hours_override === '' ? null : Number(form.ce_hours_override),
      ce_period_end:        form.ce_period_end || null,
    }
    let err: { message: string } | null
    if (editing) {
      err = (await supabase.from('staff_licenses').update(row).eq('id', editing.id)).error
    } else {
      const companyId = await getCompanyId()
      if (!companyId) { setError('Could not determine your company.'); setSaving(false); return }
      const { data: { user } } = await supabase.auth.getUser()
      err = (await supabase.from('staff_licenses').insert({
        ...row, company_id: companyId, staff_id: staffId, jurisdiction_code: form.jurisdiction_code, created_by: user?.id ?? null,
      })).error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    setOpen(false); load()
  }

  async function handleDelete(l: StaffLicense) {
    const name = byCode.get(l.jurisdiction_code)?.name ?? l.jurisdiction_code
    if (!confirm(`Remove the ${name} license? Its documents and topic records are removed too.`)) return
    // The database removes the rows; the files in storage and topic certificates need removing here.
    const [{ data: docs }, { data: comps }] = await Promise.all([
      supabase.from('staff_license_documents').select('file_path').eq('license_id', l.id),
      supabase.from('staff_license_topic_completions').select('certificate_path').eq('license_id', l.id),
    ])
    const paths = [...(docs ?? []).map(d => d.file_path as string), ...(comps ?? []).map(c => c.certificate_path as string | null).filter((p): p is string => !!p)]
    if (paths.length) await supabase.storage.from('cert-cycle-documents').remove(paths)
    await supabase.from('staff_licenses').delete().eq('id', l.id)
    load()
  }

  return (
    <div className="rounded-xl border-2 border-gray-100 shadow-sm bg-white">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-900">{bacb ? 'My Certifications' : 'State Licenses'}</p>
          <p className="text-xs text-gray-500">
            {bacb ? 'Your BACB certification first, then each state license by renewal date' : 'Where this BCBA holds a state license, and when each renews'}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openAdd} className="bg-[#025CA8] hover:bg-[#024A87] shrink-0">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
      ) : licenses.length === 0 && !bacb?.endDate ? (
        <p className="px-5 py-6 text-sm text-gray-400 text-center">No state licenses on file.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {bacb?.endDate && (() => {
            const days = daysUntil(bacb.endDate)
            return (
              <li key="bacb" className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">BACB certification</p>
                    <p className="text-xs text-gray-500">Cycle ends {fmtLicenseDate(bacb.endDate)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${expiryPill(days)}`}>{daysLabel(days)}</span>
                </div>
              </li>
            )
          })()}
          {licenses.length === 0 && <li className="px-5 py-4 text-sm text-gray-400">No state licenses on file.</li>}
          {licenses.map(l => {
            const j = byCode.get(l.jurisdiction_code)
            const days = daysUntil(l.expiration_date)
            const bacbShort = bacbEndsBeforeLicense(l, j, bacbEnd)
            const isOpen = expanded === l.id
            const jTopics = topics.filter(t => t.jurisdiction_code === l.jurisdiction_code)
            const progress = computeCeProgress(l, j, events, !!bacbEnd)
            const statuses = computeTopicStatuses(l, j, jTopics, completions)
            const topicsDue = statuses.filter(t => !t.done).length
            return (
              <li key={l.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{j?.name ?? l.jurisdiction_code}</p>
                      {l.status !== 'active' && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{STATUS_LABEL[l.status]}</span>
                      )}
                      <VerificationBadge license={l} />
                      {j?.tied_to_bacb && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Requires active BACB</span>}
                      {progress && (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${progress.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          CE {progress.exempt ? 'exempt' : progress.metByBacb ? 'met via BACB' : `${Number(progress.done.toFixed(2))}/${Number(progress.required.toFixed(2))}`}
                        </span>
                      )}
                      {topicsDue > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{topicsDue} topic{topicsDue !== 1 ? 's' : ''} due</span>}
                    </div>
                    <p className="text-xs text-gray-500">
                      {l.license_number ? `#${l.license_number} · ` : ''}Expires {fmtLicenseDate(l.expiration_date)}
                    </p>
                    {l.verification_result && l.state_expiration && l.state_expiration !== l.expiration_date && (
                      <p className="text-xs font-medium text-amber-700">
                        The state list shows this expiring {fmtLicenseDate(l.state_expiration)}. Update the date if that&apos;s right.
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${expiryPill(days)}`}>{daysLabel(days)}</span>
                  {canEdit && (
                    <>
                      <button onClick={() => openEdit(l)} title="Edit" className="rounded p-1.5 hover:bg-gray-100"><Pencil className="h-4 w-4 text-gray-400" /></button>
                      <button onClick={() => handleDelete(l)} title="Remove" className="rounded p-1.5 hover:bg-red-50"><Trash2 className="h-4 w-4 text-gray-400" /></button>
                    </>
                  )}
                  <button onClick={() => setExpanded(isOpen ? null : l.id)} title="State requirements" className="rounded p-1.5 hover:bg-gray-100">
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {bacbShort && (
                  <p className="mt-2 flex items-start gap-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    The BACB certification ends {fmtLicenseDate(bacbShort)}, before this license expires. {j?.name} requires an active BACB certification, so renewing the BACB is needed to keep this license.
                  </p>
                )}
                {l.notes && <p className="mt-1 text-xs italic text-gray-500">{l.notes}</p>}
                {isOpen && j && (
                  <div className="mt-3 space-y-4 rounded-lg bg-gray-50 p-4">
                    {progress && <CeProgressView progress={progress} />}
                    <TopicChecklist license={l} statuses={statuses} canEdit={canEdit} onChanged={load} />
                    <LicenseDocuments licenseId={l.id} canEdit={canEdit} />
                    <LicenseDetails jurisdiction={j} topics={jTopics} hideTopics />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>{editing ? 'Edit State License' : 'Add State License'}</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>State *</Label>
              <Select value={form.jurisdiction_code} disabled={!!editing}
                onValueChange={v => setForm(f => ({ ...f, jurisdiction_code: v ?? '' }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose a state" /></SelectTrigger>
                <SelectContent>
                  {jurisdictions.filter(j => editing || !usedCodes.has(j.code)).map(j => (
                    <SelectItem key={j.code} value={j.code}>{j.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">States that don’t license BCBAs aren’t listed.</p>
            </div>
            <div className="space-y-2">
              <Label>License number</Label>
              <Input value={form.license_number} onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Issued</Label>
                <Input type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Expires *</Label>
                <Input type="date" value={form.expiration_date} onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))} />
              </div>
            </div>
            {formJurisdiction?.renewal_notes && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">{formJurisdiction.renewal_notes}</p>
            )}
            {formJurisdiction?.ce_basis === 'state_hours' && (
              <div className="space-y-3 rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">State CE hours</p>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.ce_exempt_this_cycle} className="mt-0.5 accent-[#025CA8]"
                    onChange={e => setForm(f => ({ ...f, ce_exempt_this_cycle: e.target.checked }))} />
                  <span>No CE required this cycle <span className="text-gray-400">(for example a first renewal)</span></span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hours owed, if not the standard {formJurisdiction.ce_hours_required != null ? Number(formJurisdiction.ce_hours_required) : ''}</Label>
                    <Input type="number" min="0" step="0.5" value={form.ce_hours_override}
                      onChange={e => setForm(f => ({ ...f, ce_hours_override: e.target.value }))} placeholder="Standard" />
                  </div>
                  {formJurisdiction.ce_period_years != null && formJurisdiction.cycle_years != null && formJurisdiction.ce_period_years !== formJurisdiction.cycle_years && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">CE period ends</Label>
                      <Input type="date" value={form.ce_period_end} onChange={e => setForm(f => ({ ...f, ce_period_end: e.target.value }))} />
                    </div>
                  )}
                </div>
                {formJurisdiction.ce_period_years != null && formJurisdiction.cycle_years != null && formJurisdiction.ce_period_years !== formJurisdiction.cycle_years && (
                  <p className="text-xs text-gray-400">
                    {formJurisdiction.name} renews every {formJurisdiction.cycle_years} year{formJurisdiction.cycle_years === 1 ? '' : 's'} but reports CE every {formJurisdiction.ce_period_years}. Enter where the current CE period ends if it isn’t the expiration date.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Status</Label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as LicenseStatus }))}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
                {(Object.keys(STATUS_LABEL) as LicenseStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {formJurisdiction && (
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="mb-3 text-sm font-semibold text-gray-800">What {formJurisdiction.name} requires</p>
                <LicenseDetails jurisdiction={formJurisdiction} topics={topics.filter(t => t.jurisdiction_code === formJurisdiction.code)} />
              </div>
            )}
            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#025CA8] hover:bg-[#024A87]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
