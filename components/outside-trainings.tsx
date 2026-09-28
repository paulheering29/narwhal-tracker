'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { resizeImage } from '@/lib/resize-image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Ban, Check, ExternalLink, Loader2, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import { countsTowardTotals, type OutsideTraining } from '@/lib/outside-trainings'

export function ReviewBadge({ status }: { status: OutsideTraining['review_status'] }) {
  if (status === 'pending') {
    return <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pending review</span>
  }
  if (status === 'not_approved') {
    return <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Not approved · doesn’t count</span>
  }
  return null
}

// Certificates share the private cycle-documents bucket (see migration 021).
const BUCKET = 'cert-cycle-documents'

const emptyForm = {
  name: '', provider: '', completed_date: '', units: '', ethics_units: '', supervision_units: '', notes: '',
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
}) {
  const supabase = createClient()
  const router   = useRouter()

  const [open, setOpen]           = useState(false)
  const [editing, setEditing]     = useState<OutsideTraining | null>(null)
  const [form, setForm]           = useState(emptyForm)
  const [file, setFile]           = useState<File | null>(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const units = `${unitLabel}s`
  // Totals and pace are computed on the server for the dashboard pages.
  const refresh = onChanged ?? (() => router.refresh())

  function openAdd() {
    setEditing(null); setForm(emptyForm); setFile(null); setError(null); setOpen(true)
  }

  function openEdit(t: OutsideTraining) {
    setEditing(t)
    setForm({
      name: t.name, provider: t.provider ?? '', completed_date: t.completed_date,
      units: String(t.units),
      ethics_units:      t.ethics_units      ? String(t.ethics_units)      : '',
      supervision_units: t.supervision_units ? String(t.supervision_units) : '',
      notes: t.notes ?? '',
    })
    setFile(null); setError(null); setOpen(true)
  }

  async function uploadCertificate(companyId: string): Promise<string> {
    const f = file!
    const isImage = f.type.startsWith('image/')
    if (!isImage && f.type !== 'application/pdf') throw new Error('Certificate must be an image (JPG/PNG/WebP) or a PDF.')
    if (f.size > 10 * 1024 * 1024) throw new Error('Certificate must be under 10 MB.')
    const blob = isImage ? await resizeImage(f, 1600, 0.8) : f
    const path = `${companyId}/external/${staffId}/${crypto.randomUUID()}.${isImage ? 'jpg' : 'pdf'}`
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, blob, { contentType: isImage ? 'image/jpeg' : 'application/pdf', upsert: false })
    if (upErr) throw upErr
    return path
  }

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

      let certificatePath = editing?.certificate_path ?? null
      if (file) certificatePath = await uploadCertificate(companyId)

      const row = {
        name:              form.name.trim(),
        provider:          form.provider.trim() || null,
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
      if (file && editing?.certificate_path) {
        await supabase.storage.from(BUCKET).remove([editing.certificate_path])
      }
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

  // Nothing to show someone whose company doesn't let them add these.
  if (!canAdd && items.length === 0) return null

  return (
    <div className="rounded-xl border-2 border-gray-100 shadow-sm bg-white">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-900">Outside Trainings</p>
          <p className="text-xs text-gray-500">
            {units} earned somewhere else, like a conference or another provider
            {reviewRequired && !canReview && ' · your team reviews each one'}
          </p>
        </div>
        {canAdd && (
          <Button size="sm" onClick={openAdd} className="bg-[#025CA8] hover:bg-[#024A87] shrink-0">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400 text-center">None added yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map(t => (
            <li key={t.id} className={`flex items-center gap-3 px-5 py-3 ${countsTowardTotals(t) ? '' : 'bg-gray-50'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium truncate ${countsTowardTotals(t) ? 'text-gray-900' : 'text-gray-500 line-through'}`}>{t.name}</p>
                  <ReviewBadge status={t.review_status} />
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
          ))}
        </ul>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>{editing ? 'Edit Outside Training' : 'Add Outside Training'}</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Training name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ABAI Annual Convention session" />
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <Input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} placeholder="Who gave the training" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Completed on *</Label>
                <Input type="date" value={form.completed_date} onChange={e => setForm(f => ({ ...f, completed_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{units} earned *</Label>
                <Input type="number" min="0" step="0.25" value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
              </div>
            </div>
            {(showEthics || showSupervision) && (
              <div className="grid grid-cols-2 gap-4">
                {showEthics && (
                  <div className="space-y-2">
                    <Label>Ethics {units}</Label>
                    <Input type="number" min="0" step="0.25" placeholder="0" value={form.ethics_units}
                      onChange={e => setForm(f => ({ ...f, ethics_units: e.target.value }))} />
                  </div>
                )}
                {showSupervision && (
                  <div className="space-y-2">
                    <Label>Supervision {units}</Label>
                    <Input type="number" min="0" step="0.25" placeholder="0" value={form.supervision_units}
                      onChange={e => setForm(f => ({ ...f, supervision_units: e.target.value }))} />
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Certificate</Label>
              <label className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="truncate">
                  {file ? file.name : editing?.certificate_path ? 'Replace attached certificate…' : 'Attach a PDF or photo (optional)'}
                </span>
                <input type="file" accept="application/pdf,image/*" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#025CA8] hover:bg-[#024A87]">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
