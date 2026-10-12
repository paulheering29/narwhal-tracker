'use client'

import { SectionHeader } from '@/components/section-header'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { resizeImage } from '@/lib/resize-image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertTriangle, Ban, Building2, Check, ExternalLink, Loader2, Paperclip, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { countsTowardTotals, type OutsideTraining } from '@/lib/outside-trainings'
import { EXTRACTION_MAX_BYTES, type Extraction } from '@/lib/certificate-extraction'

export function NameMismatchBadge({ name }: { name: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
      title="The name printed on the certificate didn’t match this person">
      <AlertTriangle className="h-3 w-3" /> Certificate name{name ? `: ${name}` : ' differs'}
    </span>
  )
}

export function ReviewBadge({ status }: { status: OutsideTraining['review_status'] }) {
  if (status === 'pending') {
    return <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pending review</span>
  }
  if (status === 'not_approved') {
    return <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Not approved · doesn’t count</span>
  }
  return null
}

export function SourceBadge({ source }: { source: 'internal' | 'external' }) {
  return source === 'internal'
    ? <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-[#025CA8]">Internal</span>
    : <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">External</span>
}

// Certificates share the private cycle-documents bucket (see migration 021).
const BUCKET = 'cert-cycle-documents'

const emptyForm = {
  name: '', provider: '', provider_number: '', completed_date: '', units: '', ethics_units: '', supervision_units: '', notes: '',
  participant_cert_number: '', event_modality: '', trainer_name: '', trainer_cert_number: '',
  org_contact_name: '', org_contact_cert_number: '', signed: '', signature_date: '',
}

type FormKey = keyof typeof emptyForm

// The rest of what's printed on certificates like BACB's in-service form.
const DETAIL_FIELDS: { key: Exclude<FormKey, 'signed'>; label: string; placeholder?: string }[] = [
  { key: 'participant_cert_number',  label: 'Your certification number' },
  { key: 'event_modality',           label: 'Event modality', placeholder: 'e.g. In-person' },
  { key: 'trainer_name',             label: 'Trainer name' },
  { key: 'trainer_cert_number',      label: 'Trainer certification number' },
  { key: 'org_contact_name',         label: 'Organization contact name' },
  { key: 'org_contact_cert_number',  label: 'Organization contact number' },
]

// Amber outline for fields the model was unsure about or couldn't read.
const FLAG = 'border-amber-400 ring-2 ring-amber-200'

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
function similar(a: string | null, b: string | null) {
  if (!a || !b) return false
  const x = new Set(words(a)), y = words(b)
  if (x.size === 0 || y.length === 0) return false
  return y.filter(w => x.has(w)).length / Math.min(x.size, y.length) >= 0.6
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}
function fmtNum(n: number) { return n % 1 === 0 ? String(n) : String(Number(n.toFixed(2))) }

/**
 * Trainings someone earned outside the company (conferences, other
 * providers). Shown on the personal dashboard / My Progress for the person
 * themselves, and on the staff page for admins.
 */
export function OutsideTrainings({
  staffId,
  unitLabel,
  showEthics,
  showSupervision,
  items,
  onChanged,
  canAdd,
  canReview = false,
  reviewRequired = false,
  internalRows,
  onAddInternal,
}: {
  staffId: string
  unitLabel: string          // 'CEU' / 'PDU'
  showEthics: boolean        // the person's credential has an ethics minimum
  showSupervision: boolean   // …and a supervision minimum
  items: OutsideTraining[]
  onChanged?: () => void     // client pages reload their own state; server pages refresh
  canAdd: boolean            // company setting allows it, or an admin is viewing
  canReview?: boolean        // an admin viewing someone else's record
  reviewRequired?: boolean   // tells the person their entry will be reviewed
  // Passing these turns the card into one combined "Trainings" list: the company's own
  // trainings (already rendered by the caller) mixed in by date, with Internal / External badges.
  internalRows?: { id: string; date: string; node: React.ReactNode }[]
  onAddInternal?: () => void
}) {
  const supabase = createClient()
  const router   = useRouter()

  const [open, setOpen]           = useState(false)
  const [editing, setEditing]     = useState<OutsideTraining | null>(null)
  const [form, setForm]           = useState(emptyForm)
  // The certificate is uploaded as soon as it's picked (so it can be read);
  // uploadedPath is that file until the entry is saved.
  const [uploadedPath, setUploadedPath] = useState<string | null>(null)
  const [uploadedName, setUploadedName] = useState<string | null>(null)
  const [reading, setReading]     = useState(false)
  const [importNote, setImportNote] = useState<string | null>(null)   // why import didn't fill the form
  const [filled, setFilled]       = useState(false)
  const [flagged, setFlagged]     = useState<Set<FormKey>>(new Set())
  const [certInfo, setCertInfo]   = useState<{ name: string | null; mismatch: boolean; unitType: string | null } | null>(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [chooseOpen, setChooseOpen] = useState(false)

  const combined = !!internalRows
  const units = `${unitLabel}s`
  // Totals and pace are computed on the server for the dashboard pages.
  const refresh = onChanged ?? (() => router.refresh())

  function resetImport() {
    setUploadedPath(null); setUploadedName(null); setReading(false); setImportNote(null)
    setFilled(false); setFlagged(new Set()); setCertInfo(null)
  }

  function openAdd() {
    setEditing(null); setForm(emptyForm); resetImport(); setError(null); setOpen(true)
  }

  function openEdit(t: OutsideTraining) {
    setEditing(t)
    setForm({
      name: t.name, provider: t.provider ?? '', provider_number: t.provider_number ?? '', completed_date: t.completed_date,
      participant_cert_number: t.participant_cert_number ?? '', event_modality: t.event_modality ?? '',
      trainer_name: t.trainer_name ?? '', trainer_cert_number: t.trainer_cert_number ?? '',
      org_contact_name: t.org_contact_name ?? '', org_contact_cert_number: t.org_contact_cert_number ?? '',
      signed: t.signed === null ? '' : t.signed ? 'yes' : 'no', signature_date: t.signature_date ?? '',
      units: String(t.units),
      ethics_units:      t.ethics_units      ? String(t.ethics_units)      : '',
      supervision_units: t.supervision_units ? String(t.supervision_units) : '',
      notes: t.notes ?? '',
    })
    resetImport(); setError(null); setOpen(true)
  }

  // Edit one field; editing clears its "please check" highlight.
  function setField(key: FormKey, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setFlagged(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev); next.delete(key); return next
    })
  }
  const flag = (key: FormKey) => (flagged.has(key) ? FLAG : '')

  async function discardUpload() {
    if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath])
    resetImport()
  }

  // Closing without saving shouldn't leave an orphaned upload behind.
  function handleOpenChange(next: boolean) {
    if (!next && uploadedPath) void supabase.storage.from(BUCKET).remove([uploadedPath])
    if (!next) resetImport()
    setOpen(next)
  }

  async function handleFilePicked(f: File | null) {
    if (!f) return
    setError(null); setImportNote(null)
    const isHeic = /\.(heic|heif)$/i.test(f.name) || /hei[cf]/.test(f.type)
    const isImage = f.type === 'image/jpeg' || f.type === 'image/png' || isHeic
    if (f.type !== 'application/pdf' && !isImage) { setError('Certificate must be a PDF, JPEG, PNG or HEIC file.'); return }
    if (f.size > EXTRACTION_MAX_BYTES) { setError('Certificate must be under 10 MB.'); return }

    if (uploadedPath) await discardUpload()
    setReading(true)
    try {
      const companyId = await getCompanyId()
      if (!companyId) throw new Error('Could not determine your company. Please sign out and back in.')
      // Photos are shrunk (and HEIC converted) in the browser before upload.
      let blob: Blob = f
      if (isImage) {
        try { blob = await resizeImage(f, 1600, 0.8) }
        catch { throw new Error('We couldn’t open that photo. Try a JPEG or PDF instead.') }
      }
      const path = `${companyId}/external/${staffId}/${crypto.randomUUID()}.${isImage ? 'jpg' : 'pdf'}`
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(path, blob, { contentType: isImage ? 'image/jpeg' : 'application/pdf', upsert: false })
      if (upErr) throw upErr
      setUploadedPath(path); setUploadedName(f.name)

      // Editing an existing entry only swaps the file; filling would overwrite what's there.
      if (editing) return

      let result: { ok: boolean; message?: string; extraction?: Extraction; nameMismatch?: boolean } | null = null
      try {
        const res = await fetch('/api/external-trainings/extract', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
        })
        result = await res.json()
      } catch { /* fall through to the manual form */ }

      if (!result?.ok || !result.extraction) {
        setImportNote(result?.message ?? 'We couldn’t read that certificate. Please enter the details manually.')
        return
      }
      applyExtraction(result.extraction, !!result.nameMismatch)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setReading(false)
    }
  }

  function applyExtraction(x: Extraction, nameMismatch: boolean) {
    const next = { ...emptyForm }
    const low = new Set<FormKey>()
    const put = (key: FormKey, value: string | number | null, field: keyof Extraction['confidence']) => {
      if (value !== null && value !== '') next[key] = String(value)
      if (value === null || x.confidence[field] === 'low') low.add(key)
    }
    put('name',              x.course_name,       'course_name')
    put('provider',          x.provider_name,     'provider_name')
    put('completed_date',    x.completed_date,    'completed_date')
    put('units',             x.total_units,       'total_units')
    // Most certificates have no ethics / supervision split; only flag when the model saw one and doubts it.
    if (x.ethics_units !== null)      put('ethics_units',      x.ethics_units,      'ethics_units')
    if (x.supervision_units !== null) put('supervision_units', x.supervision_units, 'supervision_units')
    if (x.provider_number !== null)   put('provider_number',   x.provider_number,   'provider_number')
    // Only flag these when something was read; plenty of certificates lack them.
    for (const k of ['participant_cert_number', 'event_modality', 'trainer_name', 'trainer_cert_number',
                     'org_contact_name', 'org_contact_cert_number', 'signature_date'] as const) {
      if (x[k] !== null) put(k, x[k], k)
    }
    if (x.signed !== null) {
      next.signed = x.signed ? 'yes' : 'no'
      if (x.confidence.signed === 'low') low.add('signed')
    }
    setForm(next); setFlagged(low); setFilled(true)
    setCertInfo({ name: x.participant_name, mismatch: nameMismatch, unitType: x.unit_type })
  }

  // Warnings only; nothing here blocks saving.
  const warnings = useMemo(() => {
    const out: string[] = []
    if (certInfo?.mismatch && certInfo.name) {
      out.push(`The name on this certificate (${certInfo.name}) doesn’t look like this person’s name. Please make sure it’s the right certificate.`)
    }
    if (certInfo?.unitType && certInfo.unitType !== unitLabel) {
      out.push(`The certificate lists ${certInfo.unitType}s, but this credential tracks ${units}. Double-check the number before saving.`)
    }
    if (form.signed === 'no') {
      out.push('This certificate doesn’t look signed. Certificates usually need the trainer’s signature to count, so you may want to ask for a signed copy.')
    }
    const dup = items.find(t =>
      t.id !== editing?.id && !!form.completed_date && t.completed_date === form.completed_date &&
      (similar(t.name, form.name) || similar(t.provider, form.provider)),
    )
    if (dup) out.push(`This may already be added: “${dup.name}” on ${fmtDate(dup.completed_date)}.`)
    return out
  }, [certInfo, unitLabel, units, items, editing, form.completed_date, form.name, form.provider, form.signed])

  async function handleSave() {
    const total = parseFloat(form.units)
    if (!form.name.trim())      { setError('Training name is required.'); return }
    if (!form.completed_date)   { setError('Completion date is required.'); return }
    if (!(total > 0))           { setError(`${units} earned must be more than 0.`); return }
    const ethics      = parseFloat(form.ethics_units)      || 0
    const supervision = parseFloat(form.supervision_units) || 0
    if (ethics > total)         { setError(`Ethics ${units} can’t be more than the total.`); return }
    if (supervision > total)    { setError(`Supervision ${units} can’t be more than the total.`); return }

    setSaving(true); setError(null)
    try {
      const companyId = await getCompanyId()
      if (!companyId) throw new Error('Could not determine your company. Please sign out and back in.')

      const certificatePath = uploadedPath ?? editing?.certificate_path ?? null

      const row = {
        name:              form.name.trim(),
        provider:          form.provider.trim() || null,
        provider_number:   form.provider_number.trim() || null,
        participant_cert_number: form.participant_cert_number.trim() || null,
        event_modality:          form.event_modality.trim() || null,
        trainer_name:            form.trainer_name.trim() || null,
        trainer_cert_number:     form.trainer_cert_number.trim() || null,
        org_contact_name:        form.org_contact_name.trim() || null,
        org_contact_cert_number: form.org_contact_cert_number.trim() || null,
        signed:                  form.signed === 'yes' ? true : form.signed === 'no' ? false : null,
        signature_date:          form.signature_date || null,
        ...(certInfo ? { certificate_name: certInfo.name, certificate_name_mismatch: certInfo.mismatch } : {}),
        completed_date:    form.completed_date,
        units:             total,
        ethics_units:      ethics,
        supervision_units: supervision,
        notes:             form.notes.trim() || null,
        certificate_path:  certificatePath,
      }
      const { error: dbErr } = editing
        ? await supabase.from('external_trainings').update(row).eq('id', editing.id)
        : await supabase.from('external_trainings').insert({ ...row, company_id: companyId, staff_id: staffId })
      if (dbErr) throw dbErr

      // A replaced certificate would otherwise sit in storage forever.
      if (uploadedPath && editing?.certificate_path) {
        await supabase.storage.from(BUCKET).remove([editing.certificate_path])
      }
      resetImport()   // the upload now belongs to the saved entry
      setOpen(false)
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(t: OutsideTraining) {
    if (!confirm(`Delete "${t.name}"? This removes its ${units} from the total.`)) return
    setDeletingId(t.id)
    await supabase.from('external_trainings').delete().eq('id', t.id)
    if (t.certificate_path) await supabase.storage.from(BUCKET).remove([t.certificate_path])
    setDeletingId(null)
    refresh()
  }

  // Signed URLs expire, so create one on click rather than on load.
  async function viewCertificate(t: OutsideTraining) {
    if (!t.certificate_path) return
    // Open the tab synchronously so Safari's popup blocker allows it.
    const win = window.open('', '_blank')
    setOpeningId(t.id)
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(t.certificate_path, 300)
    setOpeningId(null)
    if (data?.signedUrl && win) win.location.href = data.signedUrl
    else win?.close()
  }

  async function setReview(t: OutsideTraining, status: OutsideTraining['review_status']) {
    setReviewingId(t.id)
    await supabase.from('external_trainings').update({ review_status: status }).eq('id', t.id)
    setReviewingId(null)
    refresh()
  }

  // Newest first, whichever kind it is.
  const rows = useMemo(() => {
    const ext = items.map(t => ({ kind: 'external' as const, id: t.id, date: t.completed_date, t }))
    const int = (internalRows ?? []).map(r => ({ kind: 'internal' as const, id: r.id, date: r.date, node: r.node }))
    return [...ext, ...int].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [items, internalRows])

  const addButton = (canAdd || (combined && onAddInternal)) && (
    <Button size="sm" onClick={() => (combined ? setChooseOpen(true) : openAdd())} className="bg-[#025CA8] hover:bg-[#024A87] shrink-0">
      <Plus className="mr-1 h-4 w-4" /> Add
    </Button>
  )

  // Nothing to show someone whose company doesn't let them add these.
  if (!canAdd && rows.length === 0) return null

  return (
    <div>
      {combined && (
        <SectionHeader
          title="Trainings"
          subtitle={`${rows.length} record${rows.length !== 1 ? 's' : ''} on file · ${units} earned here and elsewhere${reviewRequired && !canReview ? ' · your team reviews each one' : ''}`}
          action={addButton}
        />
      )}
    <div className="rounded-xl border-2 border-gray-100 shadow-sm bg-white">
      {!combined && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-900">Outside Trainings</p>
            <p className="text-xs text-gray-500">
              {units} earned somewhere else, like a conference or another provider
              {reviewRequired && !canReview && ' · your team reviews each one'}
            </p>
          </div>
          {addButton}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400 text-center">{combined ? 'No training records yet.' : 'None added yet.'}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map(row => row.kind === 'internal' ? (
            <li key={`i-${row.id}`} className="flex items-center gap-3 px-5 py-3">{row.node}</li>
          ) : (() => { const t = row.t; return (
            <li key={t.id} className={`flex items-center gap-3 px-5 py-3 ${countsTowardTotals(t) ? '' : 'bg-gray-50'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium truncate ${countsTowardTotals(t) ? 'text-gray-900' : 'text-gray-500 line-through'}`}>{t.name}</p>
                  {combined && <SourceBadge source="external" />}
                  <ReviewBadge status={t.review_status} />
                  {canReview && t.certificate_name_mismatch && <NameMismatchBadge name={t.certificate_name} />}
                </div>
                <p className="text-xs text-gray-500">
                  {fmtDate(t.completed_date)}
                  {t.provider && <> · {t.provider}</>}
                  {' · '}{fmtNum(t.units)} {units}
                  {showEthics      && t.ethics_units      > 0 && <> · {fmtNum(t.ethics_units)} ethics</>}
                  {showSupervision && t.supervision_units > 0 && <> · {fmtNum(t.supervision_units)} supervision</>}
                </p>
              </div>
              {t.certificate_path && (
                <button onClick={() => viewCertificate(t)} title="View certificate"
                  className="rounded p-1.5 hover:bg-gray-100 transition-colors">
                  {openingId === t.id ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : <ExternalLink className="h-4 w-4 text-gray-400" />}
                </button>
              )}
              {canReview && (
                reviewingId === t.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                ) : t.review_status === 'not_approved' ? (
                  <button onClick={() => setReview(t, 'approved')} title="Mark approved"
                    className="rounded p-1.5 hover:bg-emerald-50 transition-colors">
                    <Check className="h-4 w-4 text-emerald-600" />
                  </button>
                ) : (
                  <>
                    {t.review_status === 'pending' && (
                      <button onClick={() => setReview(t, 'approved')} title="Mark approved"
                        className="rounded p-1.5 hover:bg-emerald-50 transition-colors">
                        <Check className="h-4 w-4 text-emerald-600" />
                      </button>
                    )}
                    <button onClick={() => setReview(t, 'not_approved')} title="Mark not approved"
                      className="rounded p-1.5 hover:bg-red-50 transition-colors">
                      <Ban className="h-4 w-4 text-red-500" />
                    </button>
                  </>
                )
              )}
              {(canAdd || canReview) && (
                <>
                  <button onClick={() => openEdit(t)} title="Edit" className="rounded p-1.5 hover:bg-gray-100 transition-colors">
                    <Pencil className="h-4 w-4 text-gray-400" />
                  </button>
                  <button onClick={() => handleDelete(t)} disabled={deletingId === t.id} title="Delete"
                    className="rounded p-1.5 hover:bg-red-50 transition-colors">
                    {deletingId === t.id ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : <Trash2 className="h-4 w-4 text-gray-400" />}
                  </button>
                </>
              )}
            </li>
          ) })())}
        </ul>
      )}

      <Sheet open={chooseOpen} onOpenChange={setChooseOpen}>
        <SheetContent className="w-full sm:max-w-sm flex flex-col">
          <SheetHeader><SheetTitle>Add a training</SheetTitle></SheetHeader>
          <div className="space-y-3 px-6 py-5">
            {onAddInternal && (
              <button onClick={() => { setChooseOpen(false); onAddInternal() }}
                className="w-full rounded-lg border bg-white p-4 text-left hover:bg-gray-50 transition-colors">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Building2 className="h-4 w-4 text-[#025CA8]" /> Internal</p>
                <p className="mt-1 text-xs text-gray-500">Add them to one of your company&apos;s upcoming trainings.</p>
              </button>
            )}
            {canAdd && (
              <button onClick={() => { setChooseOpen(false); openAdd() }}
                className="w-full rounded-lg border bg-white p-4 text-left hover:bg-gray-50 transition-colors">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><ExternalLink className="h-4 w-4 text-violet-600" /> External</p>
                <p className="mt-1 text-xs text-gray-500">Record {units} earned somewhere else, like a conference or another provider.</p>
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>{editing ? 'Edit Outside Training' : 'Add Outside Training'}</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-4 px-6 py-5">
            {!editing && (
              <div className="space-y-2">
                <Label>Certificate</Label>
                <label className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                  {reading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" /> : <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />}
                  <span className="truncate">
                    {reading ? 'Reading your certificate…' : uploadedName ?? 'Upload a PDF or photo to fill this in for you (optional)'}
                  </span>
                  {/* No `capture`: on phones this offers camera, photo library and files. */}
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif" className="hidden" disabled={reading}
                    onChange={e => { void handleFilePicked(e.target.files?.[0] ?? null); e.target.value = '' }} />
                </label>
                {importNote && <p className="text-xs text-gray-500">{importNote}</p>}
                {filled && (
                  <p className="flex items-center gap-1.5 text-xs text-[#025CA8] bg-blue-50 rounded px-3 py-2">
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    Filled from your certificate. Please check before saving.
                    {flagged.size > 0 && ' Fields outlined in amber need a closer look.'}
                  </p>
                )}
              </div>
            )}
            {warnings.map(w => (
              <p key={w} className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {w}
              </p>
            ))}
            <div className="space-y-2">
              <Label>Training name *</Label>
              <Input value={form.name} className={flag('name')} onChange={e => setField('name', e.target.value)} placeholder="e.g. ABAI Annual Convention session" />
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <Input value={form.provider} className={flag('provider')} onChange={e => setField('provider', e.target.value)} placeholder="Who gave the training" />
            </div>
            <div className="space-y-2">
              <Label>Provider number</Label>
              <Input value={form.provider_number} className={flag('provider_number')} onChange={e => setField('provider_number', e.target.value)} placeholder="e.g. ACE provider number (optional)" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Completed on *</Label>
                <Input type="date" value={form.completed_date} className={flag('completed_date')} onChange={e => setField('completed_date', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{units} earned *</Label>
                <Input type="number" min="0" step="0.25" value={form.units} className={flag('units')} onChange={e => setField('units', e.target.value)} />
              </div>
            </div>
            {(showEthics || showSupervision) && (
              <div className="grid grid-cols-2 gap-4">
                {showEthics && (
                  <div className="space-y-2">
                    <Label>Ethics {units}</Label>
                    <Input type="number" min="0" step="0.25" placeholder="0" value={form.ethics_units} className={flag('ethics_units')}
                      onChange={e => setField('ethics_units', e.target.value)} />
                  </div>
                )}
                {showSupervision && (
                  <div className="space-y-2">
                    <Label>Supervision {units}</Label>
                    <Input type="number" min="0" step="0.25" placeholder="0" value={form.supervision_units} className={flag('supervision_units')}
                      onChange={e => setField('supervision_units', e.target.value)} />
                  </div>
                )}
              </div>
            )}
            {editing && (
              <div className="space-y-2">
                <Label>Certificate</Label>
                <label className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                  {reading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" /> : <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />}
                  <span className="truncate">
                    {uploadedName ?? (editing.certificate_path ? 'Replace attached certificate…' : 'Attach a PDF or photo (optional)')}
                  </span>
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif" className="hidden" disabled={reading}
                    onChange={e => { void handleFilePicked(e.target.files?.[0] ?? null); e.target.value = '' }} />
                </label>
              </div>
            )}
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">From the certificate (optional)</p>
            {DETAIL_FIELDS.map(f => (
              <div key={f.key} className="space-y-2">
                <Label>{f.label}</Label>
                <Input value={form[f.key]} className={flag(f.key)} placeholder={f.placeholder} onChange={e => setField(f.key, e.target.value)} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Signed?</Label>
                <select value={form.signed} onChange={e => setField('signed', e.target.value)}
                  className={`h-8 w-full rounded-lg border border-input bg-transparent px-2 text-base md:text-sm ${flag('signed')}`}>
                  <option value="">Not sure</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Signature date</Label>
                <Input type="date" value={form.signature_date} className={flag('signature_date')} onChange={e => setField('signature_date', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || reading} className="bg-[#025CA8] hover:bg-[#024A87]">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
    </div>
  )
}
