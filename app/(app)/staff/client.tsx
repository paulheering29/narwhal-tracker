'use client'

import { useEffect, useRef, useState } from 'react'
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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Loader2, Search, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
  UserPlus, Pencil, Upload, Download, CheckCircle2, XCircle,
  UserX, UserCheck, Users, ShieldCheck,
} from 'lucide-react'
import { ALL_ROLES } from '@/lib/permissions'
import { UpgradeDialog } from '@/components/upgrade-dialog'

// ─── Types ────────────────────────────────────────────────────────────────────

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

type StaffRow = StaffMember & {
  cycleStart:   string | null
  cycleEnd:     string | null
  pduDone:      number
  pduScheduled: number
  pctDone:      number
  pctScheduled: number
  pacingTarget: number
  variance:     number
}

const RBT_TOTAL_PDUS = 12

// ─── Role badge colours ───────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  'Trainer':       'bg-blue-100   text-blue-700',
  'Admin':         'bg-violet-100 text-violet-700',
  'Account Owner': 'bg-amber-100  text-amber-700',
}

// ─── Pacing helpers ───────────────────────────────────────────────────────────

function computePacingTarget(startDate: string, endDate: string): number {
  const todayMs = new Date(new Date().toDateString()).getTime()
  const startMs = new Date(startDate + 'T00:00:00').getTime()
  const endMs   = new Date(endDate   + 'T00:00:00').getTime()
  const total   = endMs - startMs
  if (total <= 0) return RBT_TOTAL_PDUS
  const elapsed = Math.max(0, Math.min(total, todayMs - startMs))
  return Math.round((elapsed / total) * RBT_TOTAL_PDUS * 2) / 2
}

function fmtPdu(n: number) { return n % 1 === 0 ? String(n) : n.toFixed(1) }
function fmtPct(n: number) { return `${Math.round(n * 100)}%` }
function fmtVariance(n: number) {
  if (n === 0) return { label: '0', cls: 'text-gray-400' }
  return n > 0
    ? { label: `+${fmtPdu(n)}`, cls: 'text-emerald-600 font-medium' }
    : { label: fmtPdu(n),       cls: 'text-red-500 font-medium' }
}
function fmtCycleDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  const m  = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${m}/${dd}/${dt.getFullYear()}`
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'cycleStart' | 'cycleEnd' | 'pduDone' | 'pctDone' | 'scheduled' | 'pctScheduled' | 'pacingTarget' | 'variance' | 'active'
type SortDir = 'asc' | 'desc'

function getSortValue(s: StaffRow, key: SortKey): number | string {
  switch (key) {
    case 'name':         return getDisplayName(s).toLowerCase()
    case 'cycleStart':   return s.cycleStart  ?? ''
    case 'cycleEnd':     return s.cycleEnd    ?? ''
    case 'pduDone':      return s.pduDone
    case 'pctDone':      return s.pctDone
    case 'scheduled':    return s.pduDone + s.pduScheduled
    case 'pctScheduled': return s.pctScheduled
    case 'pacingTarget': return s.pacingTarget
    case 'variance':     return s.variance
    case 'active':       return s.active ? 1 : 0
  }
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

type CsvRow = {
  first_name: string
  last_name: string
  preferred_first_name: string
  preferred_last_name: string
  email: string
  ehr_id: string
  credentials: string
  rbt_number: string
  original_certification_date: string | null
  current_cycle_start_date: string | null
  current_cycle_end_date:   string | null
  error: string | null
  rowNum: number
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

/**
 * Normalize a date string to YYYY-MM-DD. Accepts:
 *   YYYY-MM-DD  (pass through)
 *   M/D/YYYY or MM/DD/YYYY
 *   M-D-YYYY or MM-DD-YYYY
 * Returns null if empty. Returns 'INVALID' sentinel if malformed.
 */
function normalizeDate(raw: string): string | null | 'INVALID' {
  const s = raw.trim()
  if (!s) return null
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // US style M/D/YYYY or M-D-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const mm = m[1].padStart(2, '0')
    const dd = m[2].padStart(2, '0')
    let yyyy = m[3]
    if (yyyy.length === 2) yyyy = (parseInt(yyyy) < 50 ? '20' : '19') + yyyy
    const out = `${yyyy}-${mm}-${dd}`
    // Sanity check
    if (isNaN(new Date(out + 'T00:00:00').getTime())) return 'INVALID'
    return out
  }
  return 'INVALID'
}

function parseStaffCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r/g, '').trim().split('\n')
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map(h =>
    h.toLowerCase().replace(/\s+/g, '_').replace(/['"]/g, '')
  )
  // Accept a few aliases so users can paste headers from different sources
  const aliasMap: Record<string, string[]> = {
    first_name:                  ['first_name', 'firstname', 'first'],
    last_name:                   ['last_name', 'lastname', 'last'],
    preferred_first_name:        ['preferred_first_name', 'preferred_first', 'display_first_name', 'display_first', 'nickname'],
    preferred_last_name:         ['preferred_last_name', 'preferred_last', 'display_last_name', 'display_last'],
    email:                       ['email', 'email_address'],
    ehr_id:                      ['ehr_id', 'ehrid', 'ehr'],
    credentials:                 ['credentials', 'creds'],
    rbt_number:                  ['rbt_number', 'rbt', 'certification_number', 'cert_number', 'rbt_#'],
    original_certification_date: ['original_certification_date', 'original_cert_date', 'cert_date', 'certification_date'],
    current_cycle_start_date:    ['current_cycle_start_date', 'cycle_start_date', 'cycle_start', 'start_date'],
    current_cycle_end_date:      ['current_cycle_end_date', 'cycle_end_date', 'cycle_end', 'end_date'],
  }
  const headerIndex: Record<string, number> = {}
  for (const [canonical, variants] of Object.entries(aliasMap)) {
    for (const v of variants) {
      const idx = headers.indexOf(v)
      if (idx !== -1) { headerIndex[canonical] = idx; break }
    }
  }

  return lines.slice(1).map((line, i) => {
    if (!line.trim()) return null
    const values = parseCsvLine(line)
    const get = (key: string) => {
      const idx = headerIndex[key]
      if (idx == null) return ''
      return values[idx]?.replace(/^"|"$/g, '').trim() ?? ''
    }

    const first_name                  = get('first_name')
    const last_name                   = get('last_name')
    const preferred_first_name        = get('preferred_first_name')
    const preferred_last_name         = get('preferred_last_name')
    const email                       = get('email')
    const ehr_id                      = get('ehr_id')
    const credentials                 = get('credentials')
    const rbt_number                  = get('rbt_number')

    const origDateRaw  = get('original_certification_date')
    const startDateRaw = get('current_cycle_start_date')
    const endDateRaw   = get('current_cycle_end_date')

    const original_certification_date = normalizeDate(origDateRaw)
    const current_cycle_start_date    = normalizeDate(startDateRaw)
    const current_cycle_end_date      = normalizeDate(endDateRaw)

    let error: string | null = null
    if (!first_name && !last_name) error = 'Missing first and last name'
    else if (!first_name) error = 'Missing first name'
    else if (!last_name)  error = 'Missing last name'
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Invalid email'
    else if (original_certification_date === 'INVALID') error = 'Invalid original cert date'
    else if (current_cycle_start_date === 'INVALID') error = 'Invalid cycle start date'
    else if (current_cycle_end_date === 'INVALID')   error = 'Invalid cycle end date'
    else if (current_cycle_start_date && !current_cycle_end_date) error = 'Cycle end date required with start'
    else if (current_cycle_end_date && !current_cycle_start_date) error = 'Cycle start date required with end'
    else if (current_cycle_start_date && current_cycle_end_date && current_cycle_start_date >= current_cycle_end_date) error = 'Cycle end must be after start'

    return {
      first_name,
      last_name,
      preferred_first_name,
      preferred_last_name,
      email,
      ehr_id,
      credentials,
      rbt_number,
      original_certification_date: original_certification_date === 'INVALID' ? null : original_certification_date,
      current_cycle_start_date:    current_cycle_start_date    === 'INVALID' ? null : current_cycle_start_date,
      current_cycle_end_date:      current_cycle_end_date      === 'INVALID' ? null : current_cycle_end_date,
      error,
      rowNum: i + 2,
    }
  }).filter(Boolean) as CsvRow[]
}

function downloadCsvTemplate() {
  const csv = [
    'first_name,last_name,preferred_first_name,preferred_last_name,email,ehr_id,credentials,rbt_number,original_certification_date,current_cycle_start_date,current_cycle_end_date',
    'Jane,Doe,Janie,,jane.doe@example.com,EHR001,"M.A., RBT",RBT12345,2023-08-15,2025-08-15,2027-08-14',
    'John,Smith,,,john.smith@example.com,EHR002,"B.S., RBT",RBT67890,2024-02-01,2026-02-01,2028-01-31',
  ].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'rbt_import_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

const emptyStaffForm = {
  first_name: '', last_name: '', email: '', role: '', ehr_id: '',
  display_first_name: '', display_last_name: '', certification_number: '',
  original_certification_date: '', credentials: ''
}

// ─── Component ────────────────────────────────────────────────────────────────

type StaffTab = 'rbt' | 'trainers'

export function StaffPageClient({
  currentAuthId,
  currentRoles,
  initialStaff,
  planLimits,
}: {
  currentAuthId: string
  currentRoles: string[]
  initialStaff: StaffMember[]
  planLimits: { maxRbts: number; currentRbts: number; planName: string }
}) {
  const supabase = createClient()
  const router   = useRouter()

  const [tab, setTab] = useState<StaffTab>('rbt')

  // ── All staff (live, refreshable) ────────────────────────────────────────────
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff)

  const rbtStaff   = staff.filter(s => s.role === 'RBT')
  const adminStaff = staff.filter(s => s.role !== 'RBT')

  const isAdmin = currentRoles.includes('Admin') || currentRoles.includes('Account Owner')

  async function reloadStaff() {
    const { data } = await supabase
      .from('staff')
      .select('id, auth_id, first_name, last_name, display_first_name, display_last_name, email, role, ehr_id, active, tier, roles, certification_number, credentials')
      .order('last_name')
    setStaff(data ?? [])
  }

  // ── RBT pacing state ─────────────────────────────────────────────────────────
  const [rows, setRows]             = useState<StaffRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')
  const [sortKey, setSortKey]       = useState<SortKey>('name')
  const [sortDir, setSortDir]       = useState<SortDir>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="inline ml-1 h-3 w-3 opacity-30" />
    return sortDir === 'asc'
      ? <ArrowUp   className="inline ml-1 h-3 w-3 text-blue-500" />
      : <ArrowDown className="inline ml-1 h-3 w-3 text-blue-500" />
  }

  async function loadRbtPacing() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [cyclesRes, recordsRes] = await Promise.all([
      supabase.from('certification_cycles')
        .select('staff_id, start_date, end_date')
        .lte('start_date', today)
        .gte('end_date', today),
      supabase.from('training_records')
        .select('staff_id, completed_date, confirmed, courses(units)'),
    ])

    const cycleMap = new Map<string, { start_date: string; end_date: string }>()
    for (const c of cyclesRes.data ?? []) cycleMap.set(c.staff_id, c)

    type TRec = { completed_date: string; confirmed: boolean; units: number }
    const recMap = new Map<string, TRec[]>()
    for (const r of (recordsRes.data ?? []) as unknown as { staff_id: string; completed_date: string; confirmed: boolean; courses: { units: number } | null }[]) {
      const units = r.courses?.units ?? 0
      if (!recMap.has(r.staff_id)) recMap.set(r.staff_id, [])
      recMap.get(r.staff_id)!.push({ completed_date: r.completed_date, confirmed: r.confirmed, units })
    }

    // Use current rbtStaff from staff state
    const currentRbts = staff.filter(s => s.role === 'RBT')
    const computed: StaffRow[] = currentRbts.map(s => {
      const cycle = cycleMap.get(s.id) ?? null
      let pduDone = 0, pduScheduled = 0
      if (cycle) {
        for (const r of recMap.get(s.id) ?? []) {
          if (r.completed_date >= cycle.start_date && r.completed_date <= cycle.end_date) {
            if (r.confirmed) pduDone      += r.units
            else             pduScheduled += r.units
          }
        }
      }
      const pacingTarget = cycle ? computePacingTarget(cycle.start_date, cycle.end_date) : 0
      return {
        ...s,
        cycleStart:   cycle?.start_date ?? null,
        cycleEnd:     cycle?.end_date   ?? null,
        pduDone, pduScheduled,
        pctDone:      pduDone / RBT_TOTAL_PDUS,
        pctScheduled: (pduDone + pduScheduled) / RBT_TOTAL_PDUS,
        pacingTarget,
        variance:     pduDone - pacingTarget,
      }
    })

    setRows(computed)
    setLoading(false)
  }

  // Reload pacing whenever staff list changes (e.g. after add/activate)
  useEffect(() => { loadRbtPacing() }, [staff])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── RBT add / import state ───────────────────────────────────────────────────
  const [addRbtOpen, setAddRbtOpen]   = useState(false)
  const [staffForm, setStaffForm]     = useState(emptyStaffForm)
  const [staffSaving, setStaffSaving] = useState(false)
  const [staffError, setStaffError]   = useState<string | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [localRbtCount, setLocalRbtCount] = useState(planLimits.currentRbts)

  const [importOpen, setImportOpen]     = useState(false)
  const [csvRows, setCsvRows]           = useState<CsvRow[]>([])
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; errors: number } | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  function openAddRbt() {
    setStaffForm({ ...emptyStaffForm, role: 'RBT' })
    setStaffError(null)
    setAddRbtOpen(true)
  }

  async function handleAddStaff() {
    if (!staffForm.first_name.trim() || !staffForm.last_name.trim()) {
      setStaffError('First name and last name are required.'); return
    }
    if (localRbtCount >= planLimits.maxRbts) {
      setAddRbtOpen(false); setUpgradeOpen(true); return
    }
    setStaffSaving(true); setStaffError(null)
    const companyId = await getCompanyId()
    if (!companyId) { setStaffError('Could not determine your company.'); setStaffSaving(false); return }
    const { data: newStaff, error: insertErr } = await supabase.from('staff').insert({
      company_id: companyId,
      first_name: staffForm.first_name, last_name: staffForm.last_name,
      display_first_name: staffForm.display_first_name || null,
      display_last_name: staffForm.display_last_name || null,
      email:  staffForm.email  || null,
      role:   'RBT',
      ehr_id: staffForm.ehr_id || null,
      certification_number: staffForm.certification_number || null,
      original_certification_date: staffForm.original_certification_date || null,
      credentials: staffForm.credentials || null,
    }).select('id').single()
    if (insertErr) { setStaffError(insertErr.message); setStaffSaving(false); return }
    setLocalRbtCount(c => c + 1)
    setStaffSaving(false); setAddRbtOpen(false); setStaffForm(emptyStaffForm)
    router.push(`/staff/${newStaff.id}`)
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
      company_id: companyId,
      first_name: r.first_name,
      last_name:  r.last_name,
      display_first_name: r.preferred_first_name || null,
      display_last_name:  r.preferred_last_name  || null,
      email:  r.email  || null,
      ehr_id: r.ehr_id || null,
      role:   'RBT',
      credentials: r.credentials || null,
      certification_number:        r.rbt_number || null,
      original_certification_date: r.original_certification_date,
    }))

    const { data: insertedStaff, error: insertErr } = await supabase
      .from('staff')
      .insert(inserts)
      .select('id, first_name, last_name')

    if (insertErr || !insertedStaff) {
      setImporting(false)
      setImportResult({ imported: 0, errors: valid.length })
      return
    }

    // Build cycle inserts for rows that provided both start & end dates.
    // Match inserted rows back to csv rows by order (insert preserves order).
    const cycleInserts = insertedStaff
      .map((s, i) => {
        const r = valid[i]
        if (!r?.current_cycle_start_date || !r?.current_cycle_end_date) return null
        return {
          company_id: companyId,
          staff_id:   s.id,
          certification_type: 'RBT',
          start_date: r.current_cycle_start_date,
          end_date:   r.current_cycle_end_date,
        }
      })
      .filter(Boolean) as Array<Record<string, unknown>>

    if (cycleInserts.length > 0) {
      await supabase.from('certification_cycles').insert(cycleInserts)
    }

    setImporting(false)
    setImportResult({ imported: valid.length, errors: csvRows.filter(r => r.error).length })
    setCsvRows([]); reloadStaff()
  }

  async function toggleActive(s: StaffMember, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('staff').update({ active: !s.active }).eq('id', s.id)
    reloadStaff()
  }

  // ── Trainers tab state ───────────────────────────────────────────────────────
  const [trainerSearch, setTrainerSearch] = useState('')
  const [inviteOpen, setInviteOpen]   = useState(false)
  const [editOpen, setEditOpen]       = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)

  // ── Basics edit state ────────────────────────────────────────────────────────
  const [basicsEditOpen, setBasicsEditOpen] = useState(false)
  const [editingBasicsStaff, setEditingBasicsStaff] = useState<StaffMember | null>(null)
  const [basicsForm, setBasicsForm] = useState({
    first_name: '', last_name: '', display_first_name: '', display_last_name: '',
    email: '', credentials: '', certification_number: '',
  })
  const [basicsSaving, setBasicsSaving] = useState(false)
  const [basicsError, setBasicsError] = useState<string | null>(null)
  const [inviteForm, setInviteForm]   = useState({
    email: '', password: '', first_name: '', last_name: '',
    tier: 'staff' as 'rbt' | 'staff', roles: [] as string[],
  })
  const [editTier, setEditTier]           = useState<'rbt' | 'staff'>('staff')
  const [editRoles, setEditRoles]         = useState<string[]>([])
  const [editCertNumber, setEditCertNumber] = useState('')
  const [editCredentials, setEditCredentials] = useState('')
  const [userSaving, setUserSaving]       = useState(false)
  const [userError, setUserError]         = useState<string | null>(null)
  const [successMsg, setSuccessMsg]       = useState<string | null>(null)

  function toggleInviteRole(role: string) {
    setInviteForm(f => ({
      ...f, roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }))
  }
  function toggleEditRole(role: string) {
    setEditRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])
  }

  async function handleInvite() {
    if (!inviteForm.email || !inviteForm.password) {
      setUserError('Email and password are required.'); return
    }
    setUserSaving(true); setUserError(null)
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteForm.email, password: inviteForm.password,
        first_name: inviteForm.first_name || null, last_name: inviteForm.last_name || null,
        tier: inviteForm.tier, roles: inviteForm.roles,
        job_role: inviteForm.tier === 'rbt' ? 'RBT' : (inviteForm.roles.includes('Admin') ? 'Admin' : 'Trainer'),
      }),
    })
    const json = await res.json()
    if (!res.ok) { setUserError(json.error ?? 'Failed to create user.'); setUserSaving(false); return }
    setUserSaving(false); setInviteOpen(false)
    setSuccessMsg(`User ${inviteForm.email} created. A welcome email with their login details has been sent.`)
    setInviteForm({ email: '', password: '', first_name: '', last_name: '', tier: 'staff', roles: [] })
    reloadStaff(); router.refresh()
  }

  async function handleEditPermissions() {
    if (!editingStaff) return
    setUserSaving(true); setUserError(null)
    const certNum     = editCertNumber.trim() || null
    const credentials = editCredentials.trim() || null
    const { error } = await supabase.from('staff')
      .update({ tier: editTier, roles: editRoles, certification_number: certNum, credentials })
      .eq('id', editingStaff.id)
    if (error) { setUserError(error.message); setUserSaving(false); return }
    setStaff(prev => prev.map(s =>
      s.id === editingStaff.id ? { ...s, tier: editTier, roles: editRoles, certification_number: certNum, credentials } : s
    ))
    setUserSaving(false); setEditOpen(false)
  }

  function openEditPermissions(s: StaffMember) {
    setEditingStaff(s)
    setEditTier(s.tier ?? (s.role === 'RBT' ? 'rbt' : 'staff'))
    setEditRoles(s.roles ?? [])
    setEditCertNumber(s.certification_number ?? '')
    setEditCredentials(s.credentials ?? '')
    setUserError(null); setEditOpen(true)
  }

  function openEditBasics(s: StaffMember) {
    setEditingBasicsStaff(s)
    setBasicsForm({
      first_name: s.first_name,
      last_name: s.last_name,
      display_first_name: s.display_first_name ?? '',
      display_last_name: s.display_last_name ?? '',
      email: s.email ?? '',
      credentials: s.credentials ?? '',
      certification_number: s.certification_number ?? '',
    })
    setBasicsError(null)
    setBasicsEditOpen(true)
  }

  async function handleEditBasics() {
    if (!editingBasicsStaff) return
    if (!basicsForm.first_name.trim() || !basicsForm.last_name.trim()) {
      setBasicsError('First name and last name are required.')
      return
    }
    setBasicsSaving(true); setBasicsError(null)
    const { error } = await supabase.from('staff')
      .update({
        first_name: basicsForm.first_name,
        last_name: basicsForm.last_name,
        display_first_name: basicsForm.display_first_name || null,
        display_last_name: basicsForm.display_last_name || null,
        email: basicsForm.email || null,
        credentials: basicsForm.credentials || null,
        certification_number: basicsForm.certification_number || null,
      })
      .eq('id', editingBasicsStaff.id)
    if (error) { setBasicsError(error.message); setBasicsSaving(false); return }
    setStaff(prev => prev.map(s =>
      s.id === editingBasicsStaff.id ? {
        ...s,
        first_name: basicsForm.first_name,
        last_name: basicsForm.last_name,
        display_first_name: basicsForm.display_first_name || null,
        display_last_name: basicsForm.display_last_name || null,
        email: basicsForm.email || null,
        credentials: basicsForm.credentials || null,
        certification_number: basicsForm.certification_number || null,
      } : s
    ))
    setBasicsSaving(false); setBasicsEditOpen(false)
  }

  // ── Filtered / sorted RBT rows ────────────────────────────────────────────────
  const filtered = [...rows.filter(s => {
    const display = getDisplayName(s)
    const matchesSearch = `${display} ${s.first_name} ${s.last_name} ${s.email ?? ''} ${s.ehr_id ?? ''}`
      .toLowerCase().includes(search.toLowerCase())
    const matchesActive = filterActive === 'all'
      || (filterActive === 'active' && s.active)
      || (filterActive === 'inactive' && !s.active)
    return matchesSearch && matchesActive
  })].sort((a, b) => {
    const av = getSortValue(a, sortKey)
    const bv = getSortValue(b, sortKey)
    if (av === '' && bv !== '') return 1
    if (bv === '' && av !== '') return -1
    const cmp = typeof av === 'string'
      ? (av as string).localeCompare(bv as string)
      : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const filteredAdminStaff = adminStaff.filter(s => {
    const display = getDisplayName(s)
    return `${display} ${s.first_name} ${s.last_name} ${s.email ?? ''}`
      .toLowerCase().includes(trainerSearch.toLowerCase())
  })

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
        <p className="mt-1 text-sm text-gray-500">
          {rbtStaff.filter(s => s.active).length} active RBTs · {adminStaff.length} trainer{adminStaff.length !== 1 ? 's' : ''} / admin{adminStaff.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {([
          { key: 'rbt'      as const, label: 'RBT',              icon: Users,       count: rbtStaff.length },
          { key: 'trainers' as const, label: 'Trainers & Admin', icon: ShieldCheck, count: adminStaff.length },
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
            <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{count}</span>
          </button>
        ))}
      </div>

      {/* ── RBT Tab ─────────────────────────────────────────────────────────── */}
      {tab === 'rbt' && (
        <>
          <div className="mb-4 flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex rounded-md border border-gray-200 overflow-hidden shrink-0">
              {(['active', 'inactive', 'all'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setFilterActive(opt)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors capitalize ${
                    filterActive === opt ? 'bg-[#0A253D] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt === 'all' ? 'All' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={openImport}>
              <Upload className="mr-2 h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={openAddRbt} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              <UserPlus className="mr-2 h-4 w-4" /> Add RBT
            </Button>
          </div>

          <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-base">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[5%]" />
                <col className="w-[5%]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-sm select-none">
                  <th rowSpan={2} className="text-center align-middle font-semibold text-gray-700 px-3 py-2 border-r border-gray-200">
                    <button onClick={() => handleSort('name')} className="w-full hover:text-blue-600 transition-colors">
                      Name <SortIcon col="name" />
                    </button>
                  </th>
                  <th colSpan={2} className="text-center font-semibold text-gray-600 px-3 pt-2 pb-0.5 border-r border-gray-200">Cycle Dates</th>
                  <th colSpan={2} className="text-center font-semibold text-indigo-600 px-3 pt-2 pb-0.5 border-r border-gray-200">Actual</th>
                  <th colSpan={2} className="text-center font-semibold text-amber-600 px-3 pt-2 pb-0.5 border-r border-gray-200">Scheduled</th>
                  <th colSpan={2} className="text-center font-semibold text-teal-600 px-3 pt-2 pb-0.5 border-r border-gray-200">Pacing</th>
                  <th rowSpan={2} className="w-10 align-middle">
                    <button onClick={() => handleSort('active')} className="w-full flex justify-center hover:opacity-70 transition-opacity pt-1">
                      <SortIcon col="active" />
                    </button>
                  </th>
                  <th rowSpan={2} className="w-10 align-middle" />
                </tr>
                <tr className="bg-gray-50 border-b border-gray-200 text-sm select-none">
                  <th className="px-3 py-1.5">
                    <button onClick={() => handleSort('cycleStart')} className="w-full text-center text-gray-500 font-medium hover:text-blue-600 transition-colors">
                      Start Date <SortIcon col="cycleStart" />
                    </button>
                  </th>
                  <th className="px-3 py-1.5 border-r border-gray-200">
                    <button onClick={() => handleSort('cycleEnd')} className="w-full text-center text-gray-500 font-medium hover:text-blue-600 transition-colors">
                      End Date <SortIcon col="cycleEnd" />
                    </button>
                  </th>
                  <th className="px-3 py-1.5">
                    <button onClick={() => handleSort('pduDone')} className="w-full text-center text-indigo-500 font-medium hover:text-blue-600 transition-colors">
                      Completed <SortIcon col="pduDone" />
                    </button>
                  </th>
                  <th className="px-3 py-1.5 border-r border-gray-200">
                    <button onClick={() => handleSort('pctDone')} className="w-full text-center text-indigo-500 font-medium hover:text-blue-600 transition-colors">
                      Completed % <SortIcon col="pctDone" />
                    </button>
                  </th>
                  <th className="px-3 py-1.5">
                    <button onClick={() => handleSort('scheduled')} className="w-full text-center text-amber-500 font-medium hover:text-blue-600 transition-colors">
                      Scheduled <SortIcon col="scheduled" />
                    </button>
                  </th>
                  <th className="px-3 py-1.5 border-r border-gray-200">
                    <button onClick={() => handleSort('pctScheduled')} className="w-full text-center text-amber-500 font-medium hover:text-blue-600 transition-colors">
                      Scheduled % <SortIcon col="pctScheduled" />
                    </button>
                  </th>
                  <th className="px-3 py-1.5">
                    <button onClick={() => handleSort('pacingTarget')} className="w-full text-center text-teal-500 font-medium hover:text-blue-600 transition-colors">
                      Target <SortIcon col="pacingTarget" />
                    </button>
                  </th>
                  <th className="px-3 py-1.5 border-r border-gray-200">
                    <button onClick={() => handleSort('variance')} className="w-full text-center text-teal-500 font-medium hover:text-blue-600 transition-colors">
                      Variance <SortIcon col="variance" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={11} className="text-center py-12 text-gray-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-gray-400">
                    {search ? 'No staff match your search.' : 'No RBTs yet. Add your first team member.'}
                  </td></tr>
                ) : filtered.map(s => {
                  const hasCycle = !!s.cycleStart
                  const variance = fmtVariance(s.variance)
                  return (
                    <tr
                      key={s.id}
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${!s.active ? 'opacity-50' : ''}`}
                      onClick={() => router.push(`/staff/${s.id}`)}
                    >
                      <td className="text-center px-3 py-3 border-r border-gray-200">
                        <span className="font-semibold text-blue-600 hover:underline">{getDisplayName(s)}</span>
                      </td>
                      <td className="text-center tabular-nums text-gray-500 px-3 py-3">
                        {hasCycle ? fmtCycleDate(s.cycleStart!) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-center tabular-nums text-gray-500 px-3 py-3 border-r border-gray-200">
                        {hasCycle ? fmtCycleDate(s.cycleEnd!) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-center tabular-nums font-semibold text-indigo-700 px-3 py-3">
                        {hasCycle ? fmtPdu(s.pduDone) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-center tabular-nums px-3 py-3 border-r border-gray-200">
                        {hasCycle ? (
                          <span className={s.pctDone >= 1 ? 'text-emerald-600 font-bold' : 'text-indigo-500 font-medium'}>
                            {fmtPct(s.pctDone)}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-center tabular-nums font-semibold text-amber-700 px-3 py-3">
                        {hasCycle ? fmtPdu(s.pduDone + s.pduScheduled) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-center tabular-nums text-amber-500 font-medium px-3 py-3 border-r border-gray-200">
                        {hasCycle ? fmtPct(s.pctScheduled) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-center tabular-nums text-teal-600 font-medium px-3 py-3">
                        {hasCycle ? fmtPdu(s.pacingTarget) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`text-center tabular-nums font-semibold px-3 py-3 border-r border-gray-200 ${hasCycle ? variance.cls : 'text-gray-300'}`}>
                        {hasCycle ? variance.label : '—'}
                      </td>
                      <td className="text-center py-3">
                        <span className="text-xs text-gray-400">{s.active ? 'active' : 'inactive'}</span>
                      </td>
                      <td className="text-center py-3 space-x-1">
                        <button
                          className="rounded p-1 hover:bg-gray-100 transition-colors inline"
                          onClick={e => { e.stopPropagation(); openEditBasics(s) }}
                          title="Edit basics"
                        >
                          <Pencil className="h-4 w-4 text-gray-400" />
                        </button>
                        <button
                          className="rounded p-1 hover:bg-gray-100 transition-colors inline"
                          onClick={e => { e.stopPropagation(); router.push(`/staff/${s.id}`) }}
                        >
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Import CSV Sheet */}
          <Sheet open={importOpen} onOpenChange={open => { setImportOpen(open); if (!open) { setCsvRows([]); setImportResult(null) } }}>
            <SheetContent>
              <SheetHeader><SheetTitle>Import RBTs from CSV</SheetTitle></SheetHeader>
              <div className="flex flex-col gap-4 flex-1 px-6 py-5 overflow-hidden">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Imports only RBTs. Include cycle start &amp; end dates to create each RBT&rsquo;s current certification cycle in the same step.
                  Dates accept <code className="px-1 bg-gray-100 rounded">YYYY-MM-DD</code> or <code className="px-1 bg-gray-100 rounded">MM/DD/YYYY</code>.
                </p>
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
                  <div className="flex-1 overflow-auto rounded-lg border min-h-0">
                    <table className="w-max min-w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {['#','First','Last','Preferred','Email','EHR ID','Creds','RBT #','Orig Cert','Cycle Start','Cycle End','Status'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvRows.map(row => {
                          const pref = [row.preferred_first_name, row.preferred_last_name].filter(Boolean).join(' ')
                          return (
                            <tr key={row.rowNum} className={row.error ? 'bg-red-50' : 'bg-white'}>
                              <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{row.rowNum}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{row.first_name || <span className="text-red-400 italic">—</span>}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{row.last_name  || <span className="text-red-400 italic">—</span>}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{pref || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.email  || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.ehr_id || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.credentials || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">{row.rbt_number || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">{row.original_certification_date || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">{row.current_cycle_start_date || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">{row.current_cycle_end_date || '—'}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {row.error
                                  ? <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle className="h-3.5 w-3.5" />{row.error}</span>
                                  : <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />OK</span>}
                              </td>
                            </tr>
                          )
                        })}
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
              <SheetFooter className="mt-4">
                <Button variant="outline" onClick={() => setImportOpen(false)}>{importResult ? 'Close' : 'Cancel'}</Button>
                {!importResult && (
                  <Button onClick={handleImport} disabled={csvRows.filter(r => !r.error).length === 0 || importing} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                    {importing
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing…</>
                      : `Import ${csvRows.filter(r => !r.error).length} Staff Member${csvRows.filter(r => !r.error).length !== 1 ? 's' : ''}`}
                  </Button>
                )}
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {/* Add RBT Sheet */}
          <Sheet open={addRbtOpen} onOpenChange={setAddRbtOpen}>
            <SheetContent>
              <SheetHeader><SheetTitle>Add RBT</SheetTitle></SheetHeader>
              <div className="space-y-5 px-6 py-5">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Legal Name</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rbt_first">First Name *</Label>
                    <Input id="rbt_first" value={staffForm.first_name} onChange={e => setStaffForm(f => ({ ...f, first_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rbt_last">Last Name *</Label>
                    <Input id="rbt_last" value={staffForm.last_name} onChange={e => setStaffForm(f => ({ ...f, last_name: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rbt_email">Email</Label>
                  <Input id="rbt_email" type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="pt-3 border-t">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">RBT Details</p>
                  <div className="space-y-2">
                    <Label htmlFor="rbt_cert_num">RBT Number</Label>
                    <Input id="rbt_cert_num" placeholder="e.g. 12345" value={staffForm.certification_number} onChange={e => setStaffForm(f => ({ ...f, certification_number: e.target.value }))} />
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="rbt_cert_date">Original Certification Date</Label>
                    <Input id="rbt_cert_date" type="date" value={staffForm.original_certification_date} onChange={e => setStaffForm(f => ({ ...f, original_certification_date: e.target.value }))} />
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="rbt_creds">Credentials</Label>
                    <Input id="rbt_creds" placeholder="e.g. RBT" value={staffForm.credentials} onChange={e => setStaffForm(f => ({ ...f, credentials: e.target.value }))} />
                  </div>
                </div>
                <div className="pt-3 border-t">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Preferred Name (Optional)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="rbt_pref_first">First Name</Label>
                      <Input id="rbt_pref_first" placeholder="e.g. Alex" value={staffForm.display_first_name} onChange={e => setStaffForm(f => ({ ...f, display_first_name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rbt_pref_last">Last Name</Label>
                      <Input id="rbt_pref_last" placeholder="e.g. Smith" value={staffForm.display_last_name} onChange={e => setStaffForm(f => ({ ...f, display_last_name: e.target.value }))} />
                    </div>
                  </div>
                </div>
                {staffError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{staffError}</p>}
              </div>
              <SheetFooter>
                <Button variant="outline" onClick={() => setAddRbtOpen(false)}>Cancel</Button>
                <Button onClick={handleAddStaff} disabled={staffSaving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                  {staffSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Add & Continue'}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* ── Trainers & Admin Tab ─────────────────────────────────────────────── */}
      {tab === 'trainers' && (
        <>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name or email…"
                value={trainerSearch}
                onChange={e => setTrainerSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {isAdmin && (
              <Button onClick={() => { setUserError(null); setInviteOpen(true) }} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                <UserPlus className="mr-2 h-4 w-4" /> Add User
              </Button>
            )}
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
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAdminStaff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-10 text-gray-400">
                      {trainerSearch ? 'No staff match your search.' : 'No trainers or admins yet.'}
                    </TableCell>
                  </TableRow>
                ) : filteredAdminStaff.map(s => (
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
                    {isAdmin && (
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={e => toggleActive(s, e)}
                          title={s.active ? 'Deactivate' : 'Activate'}>
                          {s.active
                            ? <UserX className="h-4 w-4 text-red-500" />
                            : <UserCheck className="h-4 w-4 text-emerald-500" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEditBasics(s)} title="Edit basics">
                          <Pencil className="h-4 w-4 text-blue-600" />
                        </Button>
                        {s.auth_id && (
                          <Button size="sm" variant="ghost" onClick={() => openEditPermissions(s)} title="Edit permissions">
                            <ShieldCheck className="h-4 w-4 text-violet-600" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Edit Basics sheet */}
          <Sheet open={basicsEditOpen} onOpenChange={setBasicsEditOpen}>
            <SheetContent>
              <SheetHeader><SheetTitle>Edit Basics</SheetTitle></SheetHeader>
              <div className="space-y-5 px-6 py-5">
                <p className="text-sm text-gray-600">
                  Editing <span className="font-medium">{editingBasicsStaff ? getDisplayName(editingBasicsStaff) : ''}</span>
                </p>

                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Legal Name</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="basics_first">First Name *</Label>
                      <Input id="basics_first" value={basicsForm.first_name} onChange={e => setBasicsForm(f => ({ ...f, first_name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="basics_last">Last Name *</Label>
                      <Input id="basics_last" value={basicsForm.last_name} onChange={e => setBasicsForm(f => ({ ...f, last_name: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Preferred Name (Optional)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="basics_pref_first">First Name</Label>
                      <Input id="basics_pref_first" value={basicsForm.display_first_name} onChange={e => setBasicsForm(f => ({ ...f, display_first_name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="basics_pref_last">Last Name</Label>
                      <Input id="basics_pref_last" value={basicsForm.display_last_name} onChange={e => setBasicsForm(f => ({ ...f, display_last_name: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="basics_email">Email</Label>
                  <Input id="basics_email" type="email" value={basicsForm.email} onChange={e => setBasicsForm(f => ({ ...f, email: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="basics_credentials">Credentials</Label>
                  <Input id="basics_credentials" value={basicsForm.credentials} onChange={e => setBasicsForm(f => ({ ...f, credentials: e.target.value }))} placeholder="e.g. M.A., BCBA, LABA" />
                  <p className="text-xs text-gray-400">Letters that appear after the name (not a cert number).</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="basics_bacb">BACB Number</Label>
                  <Input id="basics_bacb" value={basicsForm.certification_number} onChange={e => setBasicsForm(f => ({ ...f, certification_number: e.target.value }))} placeholder="e.g. 1-23-45678" />
                  <p className="text-xs text-gray-400">Appears on certificates where this person is the trainer or the RBT.</p>
                </div>

                {basicsError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{basicsError}</p>}
              </div>
              <SheetFooter>
                <Button variant="outline" onClick={() => setBasicsEditOpen(false)}>Cancel</Button>
                <Button onClick={handleEditBasics} disabled={basicsSaving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
                  {basicsSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Basics'}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

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
                <div className="space-y-2">
                  <Label htmlFor="edit_credentials">Credentials</Label>
                  <Input
                    id="edit_credentials"
                    value={editCredentials}
                    onChange={e => setEditCredentials(e.target.value)}
                    placeholder="e.g. M.A., BCBA, LABA"
                  />
                  <p className="text-xs text-gray-400">Letters that appear after the name (not a cert number).</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_cert">BACB Cert / RBT Number</Label>
                  <Input
                    id="edit_cert"
                    value={editCertNumber}
                    onChange={e => setEditCertNumber(e.target.value)}
                    placeholder="e.g. 1-23-45678"
                  />
                  <p className="text-xs text-gray-400">Appears on certificates where this person is the trainer or the RBT.</p>
                </div>
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

      {/* Upgrade dialog */}
      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        currentPlan={planLimits.planName}
        currentRbts={localRbtCount}
        maxRbts={planLimits.maxRbts}
      />
    </div>
  )
}
