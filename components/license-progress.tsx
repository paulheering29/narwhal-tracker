'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { resizeImage } from '@/lib/resize-image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { fmtLicenseDate, topicFrequencyLabel, type StaffLicense } from '@/lib/licensure'
import type { CeProgress, TopicStatus } from '@/lib/licensure-progress'
import { CheckCircle2, Circle, ExternalLink, Loader2, Paperclip, Plus, Trash2 } from 'lucide-react'

const BUCKET = 'cert-cycle-documents'
const fmt = (n: number) => String(Number(n.toFixed(2)))

function Bar({ label, done, target }: { label: string; done: number; target: number }) {
  const met = done >= target
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className={`tabular-nums font-medium ${met ? 'text-emerald-600' : 'text-gray-700'}`}>{fmt(done)} / {fmt(target)}{met ? ' ✓' : ''}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${met ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${target > 0 ? Math.min(1, done / target) * 100 : 100}%` }} />
      </div>
    </div>
  )
}

/** The state's own CE hours for the current period: total and, where the state sets one, ethics. */
export function CeProgressView({ progress }: { progress: CeProgress }) {
  return (
    <div className="space-y-2">
      <Bar label="State CE hours" done={progress.done} target={progress.required} />
      {progress.ethicsRequired > 0 && <Bar label="Ethics hours" done={progress.ethicsDone} target={progress.ethicsRequired} />}
      <p className="text-xs text-gray-400">
        Counted from {fmtLicenseDate(progress.windowStart)} to {fmtLicenseDate(progress.windowEnd)}.
        {progress.exempt && ' Marked exempt this cycle.'}
        {progress.metByBacb && ' The state treats these hours as met while the BACB certification is active.'}
      </p>
    </div>
  )
}

/** Required topics for one license, each marked done or due, with a way to record one as done. */
export function TopicChecklist({
  license, statuses, canEdit, onChanged,
}: {
  license: StaffLicense
  statuses: TopicStatus[]
  canEdit: boolean
  onChanged: () => void
}) {
  const supabase = createClient()
  const [target, setTarget] = useState<TopicStatus | null>(null)
  const [date, setDate]     = useState('')
  const [notes, setNotes]   = useState('')
  const [file, setFile]     = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  if (statuses.length === 0) return null

  function openRecord(s: TopicStatus) {
    setTarget(s); setDate(new Date().toISOString().split('T')[0]); setNotes(''); setFile(null); setError(null)
  }

  async function handleSave() {
    if (!target) return
    if (!date) { setError('Enter the date it was completed.'); return }
    setSaving(true); setError(null)
    try {
      const companyId = await getCompanyId()
      if (!companyId) throw new Error('Could not determine your company.')
      let path: string | null = null
      if (file) {
        const isImage = file.type.startsWith('image/')
        if (!isImage && file.type !== 'application/pdf') throw new Error('The certificate must be a PDF or an image.')
        if (file.size > 10 * 1024 * 1024) throw new Error('The certificate must be under 10 MB.')
        const blob = isImage ? await resizeImage(file, 1600, 0.8) : file
        path = `${companyId}/license/${license.staff_id}/${crypto.randomUUID()}.${isImage ? 'jpg' : 'pdf'}`
        const { error: upErr } = await supabase.storage.from(BUCKET)
          .upload(path, blob, { contentType: isImage ? 'image/jpeg' : 'application/pdf', upsert: false })
        if (upErr) throw upErr
      }
      const { data: { user } } = await supabase.auth.getUser()
      const { error: dbErr } = await supabase.from('staff_license_topic_completions').insert({
        company_id: companyId, license_id: license.id, topic_id: target.topic.id,
        completed_date: date, certificate_path: path, notes: notes.trim() || null, created_by: user?.id ?? null,
      })
      if (dbErr) {
        if (path) await supabase.storage.from(BUCKET).remove([path])
        throw dbErr
      }
      setTarget(null); onChanged()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUndo(s: TopicStatus) {
    if (!s.last || !confirm(`Remove the “${s.topic.name}” entry from ${fmtLicenseDate(s.last.completed_date)}?`)) return
    await supabase.from('staff_license_topic_completions').delete().eq('id', s.last.id)
    if (s.last.certificate_path) await supabase.storage.from(BUCKET).remove([s.last.certificate_path])
    onChanged()
  }

  async function viewCertificate(path: string, id: string) {
    const win = window.open('', '_blank')   // opened synchronously so Safari allows it
    setOpeningId(id)
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
    setOpeningId(null)
    if (data?.signedUrl && win) win.location.href = data.signedUrl
    else win?.close()
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Required topics</p>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
        {statuses.map(s => (
          <li key={s.topic.id} className="flex items-start gap-3 px-3 py-2.5">
            <span className="mt-0.5 shrink-0">
              {s.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-amber-500" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-800">{s.topic.name}</p>
              <p className="text-xs text-gray-400">
                {s.topic.hours != null ? `${fmt(Number(s.topic.hours))} hr · ` : ''}{topicFrequencyLabel(s.topic)}
                {s.last && <> · {s.done ? 'done' : 'last done'} {fmtLicenseDate(s.last.completed_date)}</>}
              </p>
              {s.topic.note && <p className="text-xs text-gray-400">{s.topic.note}</p>}
            </div>
            {s.last?.certificate_path && (
              <button onClick={() => viewCertificate(s.last!.certificate_path!, s.last!.id)} title="View certificate" className="rounded p-1.5 hover:bg-gray-100">
                {openingId === s.last.id ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : <ExternalLink className="h-4 w-4 text-gray-400" />}
              </button>
            )}
            {canEdit && s.last && (
              <button onClick={() => handleUndo(s)} title="Remove last entry" className="rounded p-1.5 hover:bg-red-50"><Trash2 className="h-4 w-4 text-gray-400" /></button>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => openRecord(s)} className="shrink-0">
                <Plus className="mr-1 h-3.5 w-3.5" /> {s.done ? 'Add another' : 'Mark done'}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Sheet open={!!target} onOpenChange={o => { if (!o) setTarget(null) }}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>{target?.topic.name}</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Completed on *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Certificate</Label>
              <label className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="truncate">{file ? file.name : 'Attach a PDF or photo (optional)'}</span>
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#025CA8] hover:bg-[#024A87]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
