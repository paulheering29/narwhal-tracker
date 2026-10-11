'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ChevronRight, Loader2, Plus, Route } from 'lucide-react'

export type PathRow = {
  id: string; name: string; description: string | null; sequential: boolean; archived: boolean
  courseCount: number; units: number; ethicsUnits: number; supervisionUnits: number
  assignedCount: number; completedCount: number
}

const fmt = (n: number) => String(Number(n.toFixed(2)))

export function PathsListClient({ rows }: { rows: PathRow[] }) {
  const supabase = createClient()
  const router   = useRouter()

  const [showArchived, setShowArchived] = useState(false)
  const [open, setOpen]     = useState(false)
  const [name, setName]     = useState('')
  const [description, setDescription] = useState('')
  const [sequential, setSequential]   = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const shown = rows.filter(r => showArchived || !r.archived)
  const archivedCount = rows.filter(r => r.archived).length

  function openNew() {
    setName(''); setDescription(''); setSequential(true); setError(null); setOpen(true)
  }

  // Create the path, then go build it on its own page.
  async function handleCreate() {
    if (!name.trim()) { setError('Give the path a name.'); return }
    setSaving(true); setError(null)
    const companyId = await getCompanyId()
    if (!companyId) { setError('Could not determine your company.'); setSaving(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: err } = await supabase
      .from('learning_paths')
      .insert({
        company_id: companyId, name: name.trim(), description: description.trim() || null,
        sequential, created_by: user?.id ?? null,
      })
      .select('id')
      .single()
    setSaving(false)
    if (err || !data) { setError(err?.message ?? 'Could not create the path.'); return }
    router.push(`/paths/${data.id}`)
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Learning Paths</h1>
          <p className="mt-1 text-sm text-gray-500">
            Ordered sets of self-paced courses you can assign to someone in one step.
          </p>
        </div>
        <Button onClick={openNew} className="bg-[#025CA8] hover:bg-[#024A87]">
          <Plus className="mr-2 h-4 w-4" /> New Path
        </Button>
      </div>

      {archivedCount > 0 && (
        <label className="mb-4 flex items-center gap-2 text-sm text-gray-600 cursor-pointer w-fit">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-[#025CA8]" />
          Show archived ({archivedCount})
        </label>
      )}

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          No learning paths yet. Create one, like “New RBT Onboarding”.
        </div>
      ) : (
        <ul className="rounded-lg border bg-white shadow-sm divide-y divide-gray-100">
          {shown.map(r => (
            <li key={r.id}>
              <Link href={`/paths/${r.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#025CA8]">
                  <Route className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">{r.name}</p>
                    {r.archived && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Archived</span>}
                    {!r.sequential && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Any order</span>}
                  </div>
                  <p className="text-xs text-gray-500">
                    {r.courseCount} course{r.courseCount !== 1 ? 's' : ''} · {fmt(r.units)} unit{r.units !== 1 ? 's' : ''}
                    {r.ethicsUnits > 0 && <> · {fmt(r.ethicsUnits)} ethics</>}
                    {r.supervisionUnits > 0 && <> · {fmt(r.supervisionUnits)} supervision</>}
                  </p>
                </div>
                <div className="hidden sm:flex gap-6 text-center shrink-0">
                  <div>
                    <p className="text-lg font-bold text-gray-900 tabular-nums leading-none">{r.assignedCount}</p>
                    <p className="text-[11px] text-gray-400 mt-1">Assigned</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600 tabular-nums leading-none">{r.completedCount}</p>
                    <p className="text-[11px] text-gray-400 mt-1">Completed</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>New Learning Path</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New RBT Onboarding" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer">
              <input type="checkbox" checked={sequential} onChange={e => setSequential(e.target.checked)} className="mt-0.5 accent-[#025CA8]" />
              <div>
                <p className="text-sm font-medium text-gray-800">Complete in order</p>
                <p className="text-xs text-gray-500">Each course unlocks when the one before it is finished.</p>
              </div>
            </label>
            <p className="text-xs text-gray-400">You’ll add courses on the next screen.</p>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-[#025CA8] hover:bg-[#024A87]">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create & add courses'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
