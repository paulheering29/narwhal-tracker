'use client'

import { useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Pencil, Loader2, ShieldCheck,
  CheckCircle2, UserPlus,
  Tag, Trash2, Plus, Building2, CreditCard,
} from 'lucide-react'
import { ALL_ROLES } from '@/lib/permissions'
import { BillingClient } from '@/app/(app)/billing/client'
import type { Plan, CompanyBilling } from '@/lib/plans'

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Role badge colours ───────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  'Trainer':       'bg-blue-100   text-blue-700',
  'Admin':         'bg-violet-100 text-violet-700',
  'Account Owner': 'bg-amber-100  text-amber-700',
}

type StaffMember = {
  id: string
  auth_id: string | null
  first_name: string
  last_name: string
  display_first_name: string | null
  display_last_name: string | null
  email: string | null
  role: string | null
  ehr_id: string | null
  active: boolean
  tier: 'rbt' | 'staff' | null
  roles: string[] | null
  certification_number: string | null
  credentials: string | null
}


// ─── Component ────────────────────────────────────────────────────────────────

type Topic = { id: string; name: string; created_at: string }

type Company = { id: string; name: string; logo_url?: string | null; org_contact_staff_id?: string | null; preferred_cert_template?: string | null; enabled_cert_templates?: string[] | null }

export function AdminUsersClient({
  currentAuthId,
  currentRoles,
  initialStaff,
  initialTopics,
  initialCompany,
  planLimits,
  billing,
  allPlans,
}: {
  currentAuthId: string
  currentRoles: string[]
  initialStaff: StaffMember[]
  initialTopics: Topic[]
  initialCompany: Company
  planLimits: { maxRbts: number; currentRbts: number; planName: string }
  billing: CompanyBilling | null
  allPlans: Plan[]
}) {
  const supabase = createClient()
  const router   = useRouter()
  const searchParams = useSearchParams()

  const isAccountOwner = currentRoles.includes('Account Owner')
  type AdminTab = 'admin' | 'topics' | 'billing' | 'company'
  const initialTab: AdminTab = (() => {
    const q = searchParams.get('tab')
    if (q === 'billing' || q === 'topics' || q === 'admin' || q === 'company') return q
    return 'admin'
  })()
  const [tab, setTab] = useState<AdminTab>(initialTab)

  // ── Company state ───────────────────────────────────────────────────────────
  const [company, setCompany]             = useState<Company>(initialCompany)
  const [companyName, setCompanyName]     = useState(initialCompany.name)
  const [companySaving, setCompanySaving] = useState(false)
  const [companyStatus, setCompanyStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoStatus, setLogoStatus]       = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [orgContactId, setOrgContactId]       = useState<string>(initialCompany.org_contact_staff_id ?? '' as string)
  const [orgContactSaving, setOrgContactSaving] = useState(false)
  const [orgContactStatus, setOrgContactStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const [enabledCertTemplates, setEnabledCertTemplates]           = useState<string[]>(initialCompany.enabled_cert_templates ?? ['bacb'])
  const [certTemplateSaving, setCertTemplateSaving] = useState(false)
  const [certTemplateStatus, setCertTemplateStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  async function resizeLogo(file: File, maxPx = 800, quality = 0.85): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/jpeg', quality)
      }
      img.onerror = reject
      img.src = url
    })
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setLogoStatus({ type: 'error', msg: 'Only JPG and PNG files are accepted.' }); return
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoStatus({ type: 'error', msg: 'File must be under 5 MB.' }); return
    }
    setLogoUploading(true); setLogoStatus(null)
    try {
      const blob = await resizeLogo(file)
      const path = `${company.id}/logo.jpg`
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(path)
      const bust = `${publicUrl}?t=${Date.now()}`

      const res = await fetch('/api/company/update-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: publicUrl }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save logo URL.')

      setCompany(c => ({ ...c, logo_url: bust }))
      setLogoStatus({ type: 'success', msg: 'Logo updated.' })
    } catch (err: unknown) {
      setLogoStatus({ type: 'error', msg: err instanceof Error ? err.message : 'Upload failed.' })
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleSaveCompany() {
    const trimmed = companyName.trim()
    if (!trimmed) { setCompanyStatus({ type: 'error', msg: 'Company name is required.' }); return }
    if (trimmed === company.name) { setCompanyStatus({ type: 'success', msg: 'No changes to save.' }); return }
    setCompanySaving(true); setCompanyStatus(null)
    const res = await fetch('/api/company/update-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    const json = await res.json()
    setCompanySaving(false)
    if (!res.ok) { setCompanyStatus({ type: 'error', msg: json.error ?? 'Failed to save.' }); return }
    setCompany(c => ({ ...c, name: trimmed }))
    setCompanyStatus({ type: 'success', msg: 'Company name updated.' })
  }

  async function handleSaveCertTemplate() {
    setCertTemplateSaving(true); setCertTemplateStatus(null)
    const res = await fetch('/api/company/update-cert-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_cert_templates: enabledCertTemplates }),
    })
    const json = await res.json()
    setCertTemplateSaving(false)
    if (!res.ok) { setCertTemplateStatus({ type: 'error', msg: json.error ?? 'Failed to save.' }); return }
    setCertTemplateStatus({ type: 'success', msg: 'Certificate templates saved.' })
  }

  async function handleSaveOrgContact() {
    setOrgContactSaving(true); setOrgContactStatus(null)
    const res = await fetch('/api/company/update-org-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_contact_staff_id: orgContactId || null }),
    })
    const json = await res.json()
    setOrgContactSaving(false)
    if (!res.ok) { setOrgContactStatus({ type: 'error', msg: json.error ?? 'Failed to save.' }); return }
    setOrgContactStatus({ type: 'success', msg: 'Organization contact saved.' })
  }

  // ── Topics state ─────────────────────────────────────────────────────────────
  const [topics, setTopics]           = useState<Topic[]>(initialTopics)
  const [newTopicName, setNewTopicName] = useState('')
  const [topicSaving, setTopicSaving] = useState(false)
  const [topicError, setTopicError]   = useState<string | null>(null)
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null)

  // ── Staff state ──────────────────────────────────────────────────────────────
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff)

  // ── User state ───────────────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen]     = useState(false)
  const [editOpen, setEditOpen]         = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [inviteForm, setInviteForm]     = useState({
    email: '', password: '', first_name: '', last_name: '',
    tier: 'staff' as 'rbt' | 'staff', roles: [] as string[],
  })
  const [editTier, setEditTier]         = useState<'rbt' | 'staff'>('rbt')
  const [editRoles, setEditRoles]       = useState<string[]>([])
  const [userSaving, setUserSaving]     = useState(false)
  const [userError, setUserError]       = useState<string | null>(null)
  const [successMsg, setSuccessMsg]     = useState<string | null>(null)

  // ── Staff actions ────────────────────────────────────────────────────────────

  async function reloadStaff() {
    const { data } = await supabase
      .from('staff')
      .select('id, auth_id, first_name, last_name, display_first_name, display_last_name, email, role, ehr_id, active, tier, roles, certification_number, credentials')
      .order('last_name')
    setStaff(data ?? [])
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
    const res  = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:      inviteForm.email,
        password:   inviteForm.password,
        first_name: inviteForm.first_name || null,
        last_name:  inviteForm.last_name  || null,
        tier:       inviteForm.tier,
        roles:      inviteForm.roles,
        job_role:   inviteForm.tier === 'rbt' ? 'RBT' : (inviteForm.roles.includes('Admin') ? 'Admin' : 'Trainer'),
      }),
    })
    const json = await res.json()
    if (!res.ok) { setUserError(json.error ?? 'Failed to create user.'); setUserSaving(false); return }
    setUserSaving(false); setInviteOpen(false)
    setSuccessMsg(`User ${inviteForm.email} created. A welcome email with their login details has been sent.`)
    setInviteForm({ email: '', password: '', first_name: '', last_name: '', tier: 'staff', roles: [] })
    reloadStaff()
    router.refresh()
  }

  async function handleEditPermissions() {
    if (!editingStaff) return
    setUserSaving(true); setUserError(null)
    const { error } = await supabase.from('staff')
      .update({ tier: editTier, roles: editRoles })
      .eq('id', editingStaff.id)
    if (error) { setUserError(error.message); setUserSaving(false); return }
    setStaff(prev => prev.map(s =>
      s.id === editingStaff.id ? { ...s, tier: editTier, roles: editRoles } : s
    ))
    setUserSaving(false); setEditOpen(false)
  }

  function openEditPermissions(s: StaffMember) {
    setEditingStaff(s)
    setEditTier(s.tier ?? (s.role === 'RBT' ? 'rbt' : 'staff'))
    setEditRoles(s.roles ?? [])
    setUserError(null)
    setEditOpen(true)
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

  const adminStaff = staff.filter(s => s.role !== 'RBT')

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
          { key: 'admin'   as const, label: 'Permissions', icon: ShieldCheck, count: adminStaff.length as number | undefined },
          { key: 'topics'  as const, label: 'Topics',      icon: Tag,         count: topics.length     as number | undefined },
          { key: 'billing' as const, label: 'Billing',     icon: CreditCard,  count: undefined         as number | undefined },
          ...(isAccountOwner
            ? [{ key: 'company' as const, label: 'Company', icon: Building2, count: undefined as number | undefined }]
            : []),
        ]).map(({ key, label, icon: Icon, count }) => (
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
            {count !== undefined && (
              <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Permissions Tab ─────────────────────────────────────────────────── */}
      {tab === 'admin' && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">{adminStaff.length} trainer{adminStaff.length !== 1 ? 's' : ''} / admin{adminStaff.length !== 1 ? 's' : ''} in your organisation</p>
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
                  <TableHead>Job Role</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminStaff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-gray-400">
                      No trainers or admins yet. Click &ldquo;Add User&rdquo; to create one.
                    </TableCell>
                  </TableRow>
                ) : adminStaff.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {getDisplayName(s) || <span className="text-gray-400 italic">No name set</span>}
                      {s.auth_id === currentAuthId && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                      {s.email && <div className="text-xs text-gray-400">{s.email}</div>}
                    </TableCell>
                    <TableCell className="text-gray-600 text-sm">{s.role ?? '—'}</TableCell>
                    <TableCell>
                      {s.auth_id
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Yes</span>
                        : <span className="text-xs text-gray-400">None</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {!s.auth_id
                          ? <span className="text-gray-300 text-xs italic">—</span>
                          : (s.roles?.length ?? 0) === 0
                            ? <span className="text-gray-400 text-sm">—</span>
                            : s.roles!.map(r => (
                                <span key={r} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-700'}`}>
                                  {r}
                                </span>
                              ))
                        }
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.auth_id && (
                        <Button size="sm" variant="ghost" onClick={() => openEditPermissions(s)}
                          title="Edit permissions">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Invite sheet */}
          <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
            <SheetContent>
              <SheetHeader><SheetTitle>Add New User</SheetTitle></SheetHeader>
              <div className="space-y-5 px-6 py-5">
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
              <SheetFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button onClick={handleInvite} disabled={userSaving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                  {userSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create User'}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {/* Edit permissions sheet */}
          <Sheet open={editOpen} onOpenChange={setEditOpen}>
            <SheetContent>
              <SheetHeader><SheetTitle>Edit Permissions</SheetTitle></SheetHeader>
              <div className="space-y-5 px-6 py-5">
                <p className="text-sm text-gray-600">
                  Editing <span className="font-medium">{editingStaff ? getDisplayName(editingStaff) : ''}</span>
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
              <SheetFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={handleEditPermissions} disabled={userSaving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                  {userSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Permissions'}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* ── Topics Tab ──────────────────────────────────────────────────────── */}
      {tab === 'topics' && (
        <div className="max-w-lg space-y-6">
          <p className="text-sm text-gray-500">
            Topics are used to categorise trainings. Add your organisation&apos;s topics here,
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

      {/* ── Billing Tab ─────────────────────────────────────────────────────── */}
      {tab === 'billing' && (
        <div className="-m-8">
          <BillingClient
            billing={billing}
            allPlans={allPlans}
            rbtCount={planLimits.currentRbts}
          />
        </div>
      )}

      {/* ── Company Tab ─────────────────────────────────────────────────────── */}
      {tab === 'company' && isAccountOwner && (
        <div>
          <p className="text-sm text-gray-500 mb-6">
            Update your organisation&apos;s display name and logo.
          </p>
          <div className="grid grid-cols-2 gap-6">

          {/* Company Name */}
          <div className="rounded-lg border bg-white shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Company Name</h3>
            <div className="space-y-2">
              <Label htmlFor="company-name">Name</Label>
              <Input
                id="company-name"
                value={companyName}
                onChange={e => { setCompanyName(e.target.value); setCompanyStatus(null) }}
                placeholder="Acme Behavioral Services"
              />
            </div>

            {companyStatus && (
              <p className={`text-sm rounded px-3 py-2 ${companyStatus.type === 'success' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                {companyStatus.msg}
              </p>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleSaveCompany}
                disabled={companySaving || !companyName.trim()}
                className="bg-[#0A253D] hover:bg-[#0d2f4f]"
              >
                {companySaving
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                  : 'Save Name'}
              </Button>
            </div>
          </div>

          {/* Company Logo */}
          <div className="rounded-lg border bg-white shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Company Logo</h3>
            <p className="text-xs text-gray-400">JPG or PNG · max 5 MB · resized to 800 px on upload</p>

            {/* Preview */}
            {company.logo_url && (
              <div className="flex items-center gap-4">
                <img
                  src={company.logo_url}
                  alt="Company logo"
                  className="h-16 w-auto max-w-[200px] rounded border object-contain"
                />
              </div>
            )}

            {/* Upload button */}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
              >
                {logoUploading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</>
                  : company.logo_url ? 'Replace Logo' : 'Upload Logo'}
              </Button>
            </div>

            {logoStatus && (
              <p className={`text-sm rounded px-3 py-2 ${logoStatus.type === 'success' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                {logoStatus.msg}
              </p>
            )}
          </div>

          {/* Certificate Template */}
          <div className="rounded-lg border bg-white shadow-sm p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Certificate Template</h3>
              <p className="text-xs text-gray-400 mt-0.5">Choose the style used when generating RBT In-Service certificates.</p>
            </div>
            <div className="space-y-3">
              {[
                { value: 'bacb',   label: 'Official BACB Form',     desc: 'The original BACB fillable PDF — required if your company submits directly to the BACB.' },
                { value: 'formal', label: 'Formal (Diploma Style)', desc: 'Cream background, navy & gold borders, serif fonts — looks like a framed diploma.' },
                { value: 'fun',    label: 'Fun',                    desc: 'Bright teal & coral, colourful badges, celebratory feel — great for team recognition.' },
                { value: 'basic',  label: 'Basic',                  desc: 'Clean white with a navy top bar and a simple grid layout — professional and minimal.' },
              ].map(({ value, label, desc }) => {
                const isChecked = enabledCertTemplates.includes(value)
                return (
                  <label
                    key={value}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      isChecked ? 'border-[#0A253D] bg-[#0A253D]/5' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="cert-template"
                      value={value}
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEnabledCertTemplates([...enabledCertTemplates, value])
                        } else {
                          setEnabledCertTemplates(enabledCertTemplates.filter(t => t !== value))
                        }
                        setCertTemplateStatus(null)
                      }}
                      className="mt-0.5 accent-[#0A253D]"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </label>
                )
              })}
            </div>

            {certTemplateStatus && (
              <p className={`text-sm rounded px-3 py-2 ${certTemplateStatus.type === 'success' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                {certTemplateStatus.msg}
              </p>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleSaveCertTemplate}
                disabled={certTemplateSaving}
                className="bg-[#0A253D] hover:bg-[#0d2f4f]"
              >
                {certTemplateSaving
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                  : 'Save Template'}
              </Button>
            </div>
          </div>

          {/* In-Service Organization Contact */}
          <div className="rounded-lg border bg-white shadow-sm p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">In-Service Organization Contact</h3>
              <p className="text-xs text-gray-400 mt-0.5">This person&apos;s name and BACB cert # will print on all RBT In-Service certificates.</p>
            </div>
            <div className="space-y-2">
              <Label>Staff Member</Label>
              <Select
                value={orgContactId}
                onValueChange={v => { setOrgContactId(v === '__none__' ? '' : (v ?? '')); setOrgContactStatus(null) }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a staff member">
                    {orgContactId === '' ? (
                      'Select a staff member'
                    ) : (
                      (() => {
                        const staff = initialStaff.find(s => s.id === orgContactId)
                        if (!staff) return 'Select a staff member'
                        return `${getDisplayName(staff)}${staff.credentials ? `, ${staff.credentials}` : ''}`
                      })()
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {initialStaff
                    .filter(s => s.role !== 'RBT')
                    .sort((a, b) => a.last_name.localeCompare(b.last_name))
                    .map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {getDisplayName(s)}{s.credentials ? `, ${s.credentials}` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {orgContactStatus && (
              <p className={`text-sm rounded px-3 py-2 ${orgContactStatus.type === 'success' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                {orgContactStatus.msg}
              </p>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleSaveOrgContact}
                disabled={orgContactSaving}
                className="bg-[#0A253D] hover:bg-[#0d2f4f]"
              >
                {orgContactSaving
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                  : 'Save Contact'}
              </Button>
            </div>
          </div>
          </div>
        </div>
      )}

    </div>
  )
}
