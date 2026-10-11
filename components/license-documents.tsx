'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { resizeImage } from '@/lib/resize-image'
import { Button } from '@/components/ui/button'
import { ExternalLink, FileText, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'

const BUCKET = 'cert-cycle-documents'
const MAX_BYTES = 10 * 1024 * 1024

type Doc = { id: string; name: string; file_path: string; file_size: number | null; mime_type: string | null; created_at: string }

function fmtBytes(n: number | null) {
  if (!n) return ''
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Files attached to one state license (the license itself, renewal confirmations, …). */
export function LicenseDocuments({ licenseId, canEdit }: { licenseId: string; canEdit: boolean }) {
  const supabase = createClient()
  const [docs, setDocs]           = useState<Doc[]>([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId]       = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('staff_license_documents')
      .select('id, name, file_path, file_size, mime_type, created_at')
      .eq('license_id', licenseId).order('created_at', { ascending: false })
    setDocs((data ?? []) as Doc[])
    setLoading(false)
  }, [licenseId])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function handleUpload(file: File) {
    setError(null)
    const isImage = file.type.startsWith('image/')
    if (!isImage && file.type !== 'application/pdf') { setError('Documents must be a PDF or an image.'); return }
    if (file.size > MAX_BYTES) { setError('Documents must be under 10 MB.'); return }
    setUploading(true)
    try {
      const companyId = await getCompanyId()
      if (!companyId) throw new Error('Could not determine your company.')
      const blob = isImage ? await resizeImage(file, 1600, 0.8) : file
      const path = `${companyId}/license-docs/${licenseId}/${crypto.randomUUID()}.${isImage ? 'jpg' : 'pdf'}`
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(path, blob, { contentType: isImage ? 'image/jpeg' : 'application/pdf', upsert: false })
      if (upErr) throw upErr
      const { data: { user } } = await supabase.auth.getUser()
      const { error: dbErr } = await supabase.from('staff_license_documents').insert({
        company_id: companyId, license_id: licenseId, name: file.name, file_path: path,
        file_size: blob.size, mime_type: isImage ? 'image/jpeg' : 'application/pdf', uploaded_by: user?.id ?? null,
      })
      if (dbErr) { await supabase.storage.from(BUCKET).remove([path]); throw dbErr }
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function open(doc: Doc) {
    const win = window.open('', '_blank')   // opened synchronously so Safari allows it
    setBusyId(doc.id)
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 300)
    setBusyId(null)
    if (data?.signedUrl && win) win.location.href = data.signedUrl
    else win?.close()
  }

  async function remove(doc: Doc) {
    if (!confirm(`Delete “${doc.name}”?`)) return
    setBusyId(doc.id)
    await supabase.from('staff_license_documents').delete().eq('id', doc.id)
    await supabase.storage.from(BUCKET).remove([doc.file_path])
    setBusyId(null)
    load()
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Documentation</p>
        {canEdit && (
          <label className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            uploading ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-[#025CA8] text-white hover:bg-[#024A87] cursor-pointer'}`}>
            {uploading ? <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</> : <><Upload className="h-3 w-3" /> Add file</>}
            <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
          </label>
        )}
      </div>
      {error && <p className="mb-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-gray-300" /></div>
      ) : docs.length === 0 ? (
        <p className="py-2 text-xs text-gray-400 text-center">No documents uploaded.</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-2 rounded-md border border-gray-100 bg-white px-2.5 py-1.5">
              {d.mime_type?.startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0 text-blue-500" /> : <FileText className="h-4 w-4 shrink-0 text-red-500" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-800">{d.name}</p>
                <p className="text-[10px] text-gray-400">{fmtBytes(d.file_size)}{d.file_size ? ' · ' : ''}{new Date(d.created_at).toLocaleDateString('en-US')}</p>
              </div>
              {busyId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : (
                <>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Open" onClick={() => open(d)}><ExternalLink className="h-3.5 w-3.5 text-gray-500" /></Button>
                  {canEdit && <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Delete" onClick={() => remove(d)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
