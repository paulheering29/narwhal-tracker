'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { getDisplayName } from '@/lib/display-name'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  UserPlus, Pencil, Loader2, ShieldCheck, Users,
  Upload, Download, CheckCircle2, XCircle, UserX, UserCheck, ChevronRight, Search,
  Tag, Trash2, Plus,
} from 'lucide-react'
import { ALL_ROLES, rolesDisplay, type UserRole } from '@/lib/permissions'

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string
  tier: 'rbt' | 'staff'
  roles: string[]
  first_name: string | null
  last_name: string | null
}

// ─── Role badge colours ───────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  'Trainer':       'bg-blue-100   text-blue-700',
  'Admin':         'bg-violet-100 text-violet-700',
  'Account Owner': 'bg-amber-100  text-amber-700',
}

type StaffMember = {
  id: string
  first_name: string
  last_name: string
  display_first_name: string | null
  display_last_name: string | null
  email: string | null
  role: string | null
  ehr_id: string | null
  active: boolean
}


// ─── CSV helpers ──────────────────────────────────────────────────────────────

type CsvRow = {
  first_name: string; last_name: string; role: string
  email: string; ehr_id: string
  error: string | null; rowNum: number
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''; let inQuotes = false
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes }
    else if (char === ',' && !inQuotes) { values.push(current.trim()); current = '' }
    else { current += char }
  }
  values.push(current.trim())
  return values
}

function parseStaffCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r/g, '').trim().split('\n')
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map(h =>
    h.toLowerCase().replace(/\s+/g, '_').replace(/['"]/g, '')
  )
  return lines.slice(1).map((line, i) => {
    if (!line.trim()) return null
    const values = parseCsvLine(line)
    const get = (key: string) => values[headers.indexOf(key)]?.replace(/^"|"$/g, '') ?? ''
    const first_name = get('first_name'); const last_name = get('last_name')
    const role = get('role'); const email = get('email'); const ehr_id = get('ehr_id')
    let error: string | null = null
    if (!first_name && !last_name) error = 'Missing first and last name'
    else if (!first_name) error = 'Missing first name'
    else if (!last_name)  error = 'Missing last name'
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Invalid email'
    return { first_name, last_name, role, email, ehr_id, error, rowNum: i + 2 }
  }).filter(Boolean) as CsvRow[]
}

function downloadCsvTemplate() {
  const csv = [
    'first_name,last_name,role,email,ehr_id',
    'Jane,Doe,RBT,jane.doe@example.com,EHR001',
    'John,Smith,Trainer,john.smith@example.com,EHR002',
  ].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'rbt_import_template.csv'; a.click()
  URL.revokeObjectURL(url)
}


const emptyStaffForm = { first_name: '', last_name: '', email: '', role: '', ehr_id: '' }

// ─── Component ────────────────────────────────────────────────────────────────

type Topic = { id: string; name: string; created_at: string }

export function AdminUsersClient({
  currentUserId,
  initialUsers,
  initialStaff,
  initialTopics,
}: {
  currentUserId: string
  initialUsers: Profile[]
  initialStaff: StaffMember[]
  initialTopics: Topic[]
}) {
  const supabase = createClient()
  const router   = useRouter()

  const [tab, setTab] = useState<'rbt' | 'admin' | 'topics'>('rbt')

  // ── Topics state ─────────────────────────────────────────────────────────────
  const [topics, setTopics]           = useState<Topic[]>(initialTopics)
  const [newTopicName, setNewTopicName] = useState('')
  const [topicSaving, setTopicSaving] = useState(false)
  const [topicError, setTopicError]   = useState<string | null>(null)
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null)

  // ── Staff state ──────────────────────────────────────────────────────────────
  const [staff, setStaff]       = useState<StaffMember[]>(initialStaff)
  const [staffSearch, setStaffSearch] = useState('')
  const csvInputRef             = useRef<HTMLInputElement>(null)

  const [addOpen, setAddOpen]   = useState(false)
  const [staffForm, setStaffForm] = useState(emptyStaffForm)
  const [staffSaving, setStaffSaving] = useState(false)
  const [staffError, setStaffError]   = useState<string | null>(null)

  const [importOpen, setImportOpen]     = useState(false)
  const [csvRows, setCsvRows]           = useState<CsvRow[]>([])
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; errors: number } | null>(null)

  // ── User state ───────────────────────────────────────────────────────────────
  const [users, setUsers]             = useState<Profile[]>(initialUsers)
  const [inviteOpen, setInviteOpen]   = useState(false)
  const [editOpen, setEditOpen]       = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [inviteForm, setInviteForm]   = useState({
    email: '', password: '', first_name: '', last_name: '',
    tier: 'rbt' as 'rbt' | 'staff', roles: [] as string[],
  })
  const [editTier, setEditTier]   = useState<'rbt' | 'staff'>('rbt')
  const [editRoles, setEditRoles] = useState<string[]>([])
  const [userSaving, setUserSaving] = useState(false)
  const [userError, setUserError]   = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // ── Staff actions ────────────────────────────────────────────────────────────

  async function reloadStaff() {
    const { data } = await supabase
      .from('staff')
      .select('id, first_name, last_name, display_first_name, display_last_name, email, role, ehr_id, active')
      .order('last_name')
    setStaff(data ?? [])
  }

  async function handleAddStaff() {
    if (!staffForm.first_name.trim() || !staffForm.last_name.trim()) {
      setStaffError('First name and last name are required.')
      return
    }
    setStaffSaving(true); setStaffError(null)
    const companyId = await getCompanyId()
    if (!companyId) { setStaffError('Could not determine your company.'); setStaffSaving(false); return }
    const { data: newStaff, error: insertErr } = await supabase.from('staff').insert({
      company_id: companyId,
      first_name: staffForm.first_name, last_name: staffForm.last_name,
      email:  staffForm.email  || null,
      role:   staffForm.role   || null,
      ehr_id: staffForm.ehr_id || null,
    }).select('id').single()
    if (insertErr) { setStaffError(insertErr.message); setStaffSaving(false); return }
    setStaffSaving(false); setAddOpen(false); setStaffForm(emptyStaffForm)
    router.push(`/staff/${newStaff.id}`)
  }

  async function toggleActive(s: StaffMember, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('staff').update({ active: !s.active }).eq('id', s.id)
    reloadStaff()
  }

  function openImport() { setCsvRows([]); setImportResult(null); setImportOpen(true) }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setCsvRows(parseStaffCsv(ev.target?.result as string)); setImportResult(null) }
    reader.readAsText(file); e.target.value = ''
  }

  async function handleImport() {
    const valid = csvRows.filter(r => !r.error)
    if (valid.length === 0) return
    setImporting(true)
    const companyId = await getCompanyId()
    if (!companyId) { setImporting(false); return }
    const inserts = valid.map(r => ({
      company_id: companyId, first_name: r.first_name, last_name: r.last_name,
      role: r.role || null, email: r.email || null, ehr_id: r.ehr_id || null,
    }))
    const { error: insertErr } = await supabase.from('staff').insert(inserts)
    setImporting(false)
    if (insertErr) { setImportResult({ imported: 0, errors: valid.length }); return }
    setImportResult({ imported: valid.length, errors: csvRows.filter(r => r.error).length })
    setCsvRows([]); reloadStaff()
  }

  // ── User actions ─────────────────────────────────────────────────────────────

  function toggleInviteRole(role: string) {
    setInviteForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }))
  }

  function toggleEditRole(role: string) {
    setEditRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  async function handleInvite() {
    if (!inviteForm.email || !inviteForm.password) {
      setUserError('Email and password are required.'); return
    }
    setUserSaving(true); setUserError(null)
    const companyId = await getCompanyId()
    if (!companyId) { setUserError('Could not determine your company.'); setUserSaving(false); return }
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: inviteForm.email, password: inviteForm.password,
    })
    if (signUpError || !data.user) {
      setUserError(signUpError?.message ?? 'Failed to create user.'); setUserSaving(false); return
    }
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id, company_id: companyId,
      tier: inviteForm.tier, roles: inviteForm.roles,
      first_name: inviteForm.first_name || null, last_name: inviteForm.last_name || null,
    })
    if (profileError) { setUserError(profileError.message); setUserSaving(false); return }
    setUserSaving(false); setInviteOpen(false)
    setSuccessMsg(`User ${inviteForm.email} created successfully.`)
    setInviteForm({ email: '', password: '', first_name: '', last_name: '', tier: 'rbt', roles: [] })
    router.refresh()
  }

  async function handleEditPermissions() {
    if (!editingUser) return
    setUserSaving(true); setUserError(null)
    const { error } = await supabase.from('profiles')
      .update({ tier: editTier, roles: editRoles })
      .eq('id', editingUser.id)
    if (error) { setUserError(error.message); setUserSaving(false); return }
    setUsers(prev => prev.map(u =>
      u.id === editingUser.id ? { ...u, tier: editTier, roles: editRoles } : u
    ))
    setUserSaving(false); setEditOpen(false)
  }

  function openEditPermissions(u: Profile) {
    setEditingUser(u); setEditTier(u.tier); setEditRoles(u.roles); setUserError(null); setEditOpen(true)
  }

  // ── Topic actions ────────────────────────────────────────────────────────────

  async function reloadTopics() {
    const { data } = await supabase.from('topics').select('id, name, created_at').order('name')
    setTopics(data ?? [])
  }

  async function handleAddTopic() {
    const name = newTopicName.trim()
    if (!name) { setTopicError('Topic name is required.'); return }
    setTopicSaving(true); setTopicError(null)
    const companyId = await getCompanyId()
    if (!companyId) { setTopicError('Could not determine your company.'); setTopicSaving(false); return }
    const { error } = await supabase.from('topics').insert({ company_id: companyId, name })
    if (error) {
      setTopicError(error.message.includes('unique') ? `"${name}" already exists.` : error.message)
      setTopicSaving(false); return
    }
    setNewTopicName(''); setTopicSaving(false)
    reloadTopics()
  }

  async function handleDeleteTopic(topic: Topic) {
    setDeletingTopicId(topic.id); setTopicError(null)
    // Check if any courses reference this topic before attempting delete
    const { count } = await supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('topic_id', topic.id)
    if ((count ?? 0) > 0) {
      setTopicError(`"${topic.name}" is used by ${count} training${count !== 1 ? 's' : ''} and cannot be deleted.`)
      setDeletingTopicId(null); return
    }
    const { error } = await supabase.from('topics').delete().eq('id', topic.id)
    setDeletingTopicId(null)
    if (error) { setTopicError(error.message); return }
    reloadTopics()
  }

  // ── Filtered staff ───────────────────────────────────────────────────────────

  const filteredStaff = staff.filter(s => {
    const display = getDisplayName(s)
    return `${display} ${s.first_name} ${s.last_name} ${s.email ?? ''} ${s.ehr_id ?? ''}`
      .toLowerCase().includes(staffSearch.toLowerCase())
  })

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-violet-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Admin</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {([
          { key: 'rbt',    label: 'RBT',    icon: Users,       count: staff.length  },
          { key: 'admin',  label: 'Admin',  icon: ShieldCheck, count: users.length  },
          { key: 'topics', label: 'Topics', icon: Tag,         count: topics.length },
        ] as const).map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── RBT Tab ─────────────────────────────────────────────────────────── */}
      {tab === 'rbt' && (
        <>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, or EHR ID…"
                value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={openImport}>
                <Upload className="mr-2 h-4 w-4" /> Import CSV
              </Button>
              <Button
                onClick={() => { setStaffForm(emptyStaffForm); setStaffError(null); setAddOpen(true) }}
                className="bg-[#0A253D] hover:bg-[#0d2f4f]"
              >
                <UserPlus className="mr-2 h-4 w-4" /> Add RBT
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>EHR ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-gray-400">
                      {staffSearch ? 'No staff match your search.' : 'No staff yet. Add your first team member.'}
                    </TableCell>
                  </TableRow>
                ) : filteredStaff.map(s => (
                  <TableRow
                    key={s.id}
                    className={`cursor-pointer hover:bg-gray-50 ${!s.active ? 'opacity-50' : ''}`}
                    onClick={() => router.push(`/staff/${s.id}`)}
                  >
                    <TableCell className="font-medium text-blue-600 hover:underline">
                      {getDisplayName(s)}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">{s.email ?? '—'}</TableCell>
                    <TableCell className="font-mono text-sm text-gray-500">{s.ehr_id ?? '—'}</TableCell>
                    <TableCell className="text-gray-500">{s.role ?? '—'}</TableCell>
                    <TableCell className="text-center text-base leading-none" title={s.active ? 'Active' : 'Inactive'}>
                      {s.active ? '🟢' : '🔴'}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={e => toggleActive(s, e)}
                        title={s.active ? 'Deactivate' : 'Activate'}>
                        {s.active
                          ? <UserX className="h-4 w-4 text-red-500" />
                          : <UserCheck className="h-4 w-4 text-emerald-500" />}
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={e => { e.stopPropagation(); router.push(`/staff/${s.id}`) }}>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Import CSV Dialog */}
          <Dialog open={importOpen} onOpenChange={open => { setImportOpen(open); if (!open) { setCsvRows([]); setImportResult(null) } }}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
              <DialogHeader><DialogTitle>Import RBT Staff from CSV</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-4 flex-1 overflow-hidden">
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>
                    <Download className="mr-2 h-4 w-4" /> Download Template
                  </Button>
                  <span className="text-sm text-gray-400">fill it out and upload below</span>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => csvInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    {csvRows.length > 0 ? 'Choose a different file' : 'Choose CSV file'}
                  </Button>
                  <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
                  {csvRows.length > 0 && (
                    <span className="text-sm text-gray-600">
                      {csvRows.length} rows · <span className="text-emerald-600">{csvRows.filter(r => !r.error).length} valid</span>
                      {csvRows.some(r => r.error) && <> · <span className="text-red-500">{csvRows.filter(r => r.error).length} with errors</span></>}
                    </span>
                  )}
                </div>
                {importResult && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <p className="text-sm text-emerald-800">
                      <span className="font-medium">{importResult.imported} staff member{importResult.imported !== 1 ? 's' : ''} imported.</span>
                      {importResult.errors > 0 && ` ${importResult.errors} row${importResult.errors !== 1 ? 's' : ''} skipped.`}
                    </p>
                  </div>
                )}
                {csvRows.length > 0 && !importResult && (
                  <div className="flex-1 overflow-y-auto rounded-lg border min-h-0">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {['#','First Name','Last Name','Role','Email','EHR ID','Status'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvRows.map(row => (
                          <tr key={row.rowNum} className={row.error ? 'bg-red-50' : 'bg-white'}>
                            <td className="px-3 py-2 text-gray-400">{row.rowNum}</td>
                            <td className="px-3 py-2">{row.first_name || <span className="text-red-400 italic">—</span>}</td>
                            <td className="px-3 py-2">{row.last_name  || <span className="text-red-400 italic">—</span>}</td>
                            <td className="px-3 py-2 text-gray-500">{row.role   || '—'}</td>
                            <td className="px-3 py-2 text-gray-500">{row.email  || '—'}</td>
                            <td className="px-3 py-2 text-gray-500">{row.ehr_id || '—'}</td>
                            <td className="px-3 py-2">
                              {row.error
                                ? <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle className="h-3.5 w-3.5" />{row.error}</span>
                                : <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />OK</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {csvRows.length === 0 && !importResult && (
                  <div className="flex-1 rounded-lg border border-dashed flex items-center justify-center text-sm text-gray-400 min-h-[120px]">
                    Upload a CSV file to preview rows before importing
                  </div>
                )}
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setImportOpen(false)}>{importResult ? 'Close' : 'Cancel'}</Button>
                {!importResult && (
                  <Button onClick={handleImport} disabled={csvRows.filter(r => !r.error).length === 0 || importing} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                    {importing
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing…</>
                      : `Import ${csvRows.filter(r => !r.error).length} Staff Member${csvRows.filter(r => !r.error).length !== 1 ? 's' : ''}`}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Staff Dialog */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Legal Name</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sf_first">First Name *</Label>
                    <Input id="sf_first" value={staffForm.first_name} onChange={e => setStaffForm(f => ({ ...f, first_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf_last">Last Name *</Label>
                    <Input id="sf_last" value={staffForm.last_name} onChange={e => setStaffForm(f => ({ ...f, last_name: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sf_email">Email</Label>
                  <Input id="sf_email" type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={staffForm.role} onValueChange={v => setStaffForm(f => ({ ...f, role: v ?? '' }))}>
                      <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RBT">RBT</SelectItem>
                        <SelectItem value="Trainer">Trainer</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf_ehr">EHR ID</Label>
                    <Input id="sf_ehr" value={staffForm.ehr_id} onChange={e => setStaffForm(f => ({ ...f, ehr_id: e.target.value }))} />
                  </div>
                </div>
                <p className="text-xs text-gray-400">Preferred/goes-by names can be set on the staff member's profile page.</p>
                {staffError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{staffError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAddStaff} disabled={staffSaving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                  {staffSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Add & Continue'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* ── Admin Tab ───────────────────────────────────────────────────────── */}
      {tab === 'admin' && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''} in your organisation</p>
            <Button onClick={() => { setUserError(null); setInviteOpen(true) }} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              <UserPlus className="mr-2 h-4 w-4" /> Add User
            </Button>
          </div>

          {successMsg && (
            <div className="mb-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMsg}</div>
          )}

          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.first_name || u.last_name
                        ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
                        : <span className="text-gray-400 italic">No name set</span>}
                      {u.id === currentUserId && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        u.tier === 'rbt' ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {u.tier === 'rbt' ? 'RBT' : 'Staff'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0
                          ? <span className="text-gray-400 text-sm">—</span>
                          : u.roles.map(r => (
                              <span key={r} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-700'}`}>
                                {r}
                              </span>
                            ))
                        }
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEditPermissions(u)}
                        title="Edit permissions">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Invite dialog */}
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inv_first">First Name</Label>
                    <Input id="inv_first" value={inviteForm.first_name} onChange={e => setInviteForm(f => ({ ...f, first_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv_last">Last Name</Label>
                    <Input id="inv_last" value={inviteForm.last_name} onChange={e => setInviteForm(f => ({ ...f, last_name: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv_email">Email *</Label>
                  <Input id="inv_email" type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv_pw">Temporary Password *</Label>
                  <Input id="inv_pw" type="password" value={inviteForm.password} onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Tier</Label>
                  <Select value={inviteForm.tier} onValueChange={v => setInviteForm(f => ({
                    ...f, tier: (v as 'rbt' | 'staff'), roles: v === 'rbt' ? [] : f.roles,
                  }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rbt">RBT — own data only</SelectItem>
                      <SelectItem value="staff">Staff — full app access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {inviteForm.tier === 'staff' && (
                  <div className="space-y-2">
                    <Label>Roles</Label>
                    <div className="flex flex-col gap-2">
                      {ALL_ROLES.map(role => (
                        <label key={role} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={inviteForm.roles.includes(role)}
                            onChange={() => toggleInviteRole(role)}
                            className="rounded border-gray-300 text-blue-600"
                          />
                          <span className="text-sm">{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {userError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{userError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button onClick={handleInvite} disabled={userSaving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                  {userSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create User'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit permissions dialog */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Edit Permissions</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-gray-600">
                  Editing <span className="font-medium">{editingUser?.first_name} {editingUser?.last_name}</span>
                </p>
                <div className="space-y-2">
                  <Label>Tier</Label>
                  <Select value={editTier} onValueChange={v => {
                    const t = v as 'rbt' | 'staff'
                    setEditTier(t)
                    if (t === 'rbt') setEditRoles([])
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rbt">RBT — own data only</SelectItem>
                      <SelectItem value="staff">Staff — full app access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editTier === 'staff' && (
                  <div className="space-y-2">
                    <Label>Roles</Label>
                    <div className="flex flex-col gap-2">
                      {ALL_ROLES.map(role => (
                        <label key={role} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editRoles.includes(role)}
                            onChange={() => toggleEditRole(role)}
                            className="rounded border-gray-300 text-blue-600"
                          />
                          <span className="text-sm">{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {userError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{userError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={handleEditPermissions} disabled={userSaving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                  {userSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Permissions'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* ── Topics Tab ──────────────────────────────────────────────────────── */}
      {tab === 'topics' && (
        <div className="max-w-lg space-y-6">
          <p className="text-sm text-gray-500">
            Topics are used to categorise trainings. Add your organisation's topics here,
            then select one when creating or editing a training.
          </p>

          {/* Add topic */}
          <div className="flex gap-2">
            <Input
              placeholder="New topic name…"
              value={newTopicName}
              onChange={e => { setNewTopicName(e.target.value); setTopicError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
              className="flex-1"
            />
            <Button
              onClick={handleAddTopic}
              disabled={topicSaving || !newTopicName.trim()}
              className="bg-[#0A253D] hover:bg-[#0d2f4f] gap-1.5"
            >
              {topicSaving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Plus className="h-4 w-4" />}
              Add Topic
            </Button>
          </div>

          {topicError && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{topicError}</p>
          )}

          {/* Topic list */}
          {topics.length === 0 ? (
            <div className="rounded-lg border border-dashed flex items-center justify-center py-10 text-sm text-gray-400">
              No topics yet. Add your first one above.
            </div>
          ) : (
            <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {topics.map(topic => (
                  <li key={topic.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-800">{topic.name}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteTopic(topic)}
                      disabled={deletingTopicId === topic.id}
                      title="Delete topic"
                      className="text-gray-400 hover:text-red-500"
                    >
                      {deletingTopicId === topic.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
