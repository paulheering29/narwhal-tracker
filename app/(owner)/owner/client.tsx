'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Pencil, Building2, Tag, Gift, Trash2, ShieldCheck } from 'lucide-react'
import { LicenseLists, type LicenseSync } from './license-lists'

// ─── Types ────────────────────────────────────────────────────────────────────

type Plan = {
  id: string
  name: string
  display_name: string
  max_rbts: number
  allows_email: boolean
  storage_gb: number
  price_monthly: number
  stripe_price_id: string | null
  sort_order: number
  active: boolean
}

type Company = {
  id: string
  name: string
  created_at: string
  subscription_status: string
  access_type: 'paid' | 'beta' | 'comp'
  access_note: string | null
  staff: number
  rbts: number
  owner: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: { id: string; name: string; display_name: string } | null
}

type Grant = {
  id: string
  email: string
  access_type: 'beta' | 'comp'
  plan_id: string
  note: string | null
  claimed_at: string | null
  created_at: string
}

type Props = {
  initialPlans: Plan[]
  initialCompanies: Company[]
  initialGrants: Grant[]
  licenseSync: LicenseSync[]
}

const ACCESS_LABEL = { paid: 'Paid', beta: 'Beta', comp: 'Free (comp)' } as const
const ACCESS_STYLE = {
  paid: 'bg-gray-100 text-gray-600',
  beta: 'bg-amber-100 text-amber-700',
  comp: 'bg-emerald-100 text-emerald-700',
} as const

async function post(url: string, body: unknown): Promise<{ error?: string; appliedToExisting?: boolean }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.json().catch(() => ({ error: 'Request failed' }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OwnerClient({ initialPlans, initialCompanies, initialGrants, licenseSync }: Props) {
  const supabase = createClient()
  const [plans, setPlans]         = useState<Plan[]>(initialPlans)
  const [companies]               = useState<Company[]>(initialCompanies)
  const [tab, setTab]             = useState<'companies' | 'access' | 'plans' | 'licenses'>('companies')
  const [grants, setGrants]       = useState<Grant[]>(initialGrants)
  const [grantForm, setGrantForm] = useState({ email: '', planId: '', accessType: 'beta', note: '' })
  const [grantError, setGrantError] = useState<string | null>(null)
  const [savingGrant, setSavingGrant] = useState(false)
  const [accessType, setAccessType] = useState<'paid' | 'beta' | 'comp'>('paid')
  const [accessNote, setAccessNote] = useState('')

  // Plan edit dialog
  const [editPlan, setEditPlan]       = useState<Plan | null>(null)
  const [planForm, setPlanForm]       = useState<Partial<Plan>>({})
  const [savingPlan, setSavingPlan]   = useState(false)
  const [planError, setPlanError]     = useState<string | null>(null)

  // Company plan override dialog
  const [editCompany, setEditCompany] = useState<Company | null>(null)
  const [overridePlanId, setOverridePlanId] = useState('')
  const [savingOverride, setSavingOverride] = useState(false)
  const [overrideError, setOverrideError]   = useState<string | null>(null)

  // ── Plan editing ──────────────────────────────────────────────────────────

  function openEditPlan(plan: Plan) {
    setEditPlan(plan)
    setPlanForm({
      display_name:    plan.display_name,
      max_rbts:        plan.max_rbts,
      allows_email:    plan.allows_email,
      storage_gb:      plan.storage_gb,
      price_monthly:   plan.price_monthly,
      stripe_price_id: plan.stripe_price_id ?? '',
    })
    setPlanError(null)
  }

  async function handleSavePlan() {
    if (!editPlan) return
    setSavingPlan(true)
    setPlanError(null)

    const res = await fetch('/api/owner/update-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: editPlan.id,
        updates: {
          display_name:    planForm.display_name,
          max_rbts:        Number(planForm.max_rbts),
          allows_email:    planForm.allows_email,
          storage_gb:      Number(planForm.storage_gb),
          price_monthly:   Number(planForm.price_monthly),
          stripe_price_id: planForm.stripe_price_id || null,
        },
      }),
    })
    const json = await res.json()
    if (json.error) { setPlanError(json.error); setSavingPlan(false); return }

    // Refresh plans from DB
    const { data } = await supabase.from('plans').select('*').order('sort_order')
    setPlans(data ?? [])
    setSavingPlan(false)
    setEditPlan(null)
  }

  // ── Company plan override ─────────────────────────────────────────────────

  function openOverride(company: Company) {
    setEditCompany(company)
    setOverridePlanId(company.plan?.id ?? '')
    setAccessType(company.access_type)
    setAccessNote(company.access_note ?? '')
    setOverrideError(null)
  }

  async function handleSaveOverride() {
    if (!editCompany) return
    setSavingOverride(true)
    setOverrideError(null)

    const json = await post('/api/owner/access', {
      action: 'setCompany',
      companyId: editCompany.id,
      planId: overridePlanId,
      accessType,
      note: accessNote,
    })
    if (json.error) { setOverrideError(json.error); setSavingOverride(false); return }

    setSavingOverride(false)
    setEditCompany(null)
    window.location.reload()
  }

  // ── Free / beta access list ───────────────────────────────────────────────

  async function handleAddGrant() {
    setSavingGrant(true)
    setGrantError(null)
    const json = await post('/api/owner/access', { action: 'addGrant', ...grantForm })
    setSavingGrant(false)
    if (json.error) { setGrantError(json.error); return }
    window.location.reload()
  }

  async function handleRemoveGrant(g: Grant) {
    if (!confirm(`Remove ${g.email} from the list?${g.claimed_at ? ' Their organization keeps its current plan.' : ''}`)) return
    const json = await post('/api/owner/access', { action: 'removeGrant', grantId: g.id })
    if (json.error) { alert(json.error); return }
    setGrants(gs => gs.filter(x => x.id !== g.id))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const planName = (id: string) => plans.find(p => p.id === id)?.display_name ?? '—'
  const th = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide'
  const tabs = [
    { key: 'companies', label: 'Organizations', Icon: Building2 },
    { key: 'access',    label: 'Free & beta access', Icon: Gift },
    { key: 'plans',     label: 'Plans', Icon: Tag },
    { key: 'licenses',  label: 'License lists', Icon: ShieldCheck },
  ] as const
  const nonPaid = companies.filter(c => c.access_type !== 'paid').length

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Owner Admin</h1>
      <p className="text-sm text-gray-500 mb-8">
        {companies.length} organizations · {nonPaid} on free or beta access
      </p>

      <div className="flex gap-2 mb-8 border-b">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-[#025CA8] text-[#025CA8]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'companies' && (
        <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Organization', 'Account owner', 'Staff', 'RBTs', 'Plan', 'Access', 'Billing', 'Signed up', ''].map(h => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.owner ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.staff}</td>
                  <td className="px-4 py-3 text-gray-600">{c.rbts}</td>
                  <td className="px-4 py-3 text-gray-600">{c.plan?.display_name ?? 'No plan'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACCESS_STYLE[c.access_type]}`}>
                      {ACCESS_LABEL[c.access_type]}
                    </span>
                    {c.access_note && <div className="text-xs text-gray-400 mt-0.5">{c.access_note}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize">
                    {c.stripe_subscription_id ? c.subscription_status : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" onClick={() => openOverride(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'access' && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-white shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Pre-approve someone</h2>
            <p className="text-sm text-gray-500 mb-4">
              Add their email. When they sign up, their organization is put on the plan below automatically.
              If they already have an account, it&apos;s applied now.
            </p>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] items-end">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder="tester@example.com" value={grantForm.email}
                  onChange={e => setGrantForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={grantForm.planId} onValueChange={v => setGrantForm(f => ({ ...f, planId: v ?? '' }))}>
                  <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
                  <SelectContent>
                    {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={grantForm.accessType} onValueChange={v => setGrantForm(f => ({ ...f, accessType: v ?? 'beta' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beta">Beta</SelectItem>
                    <SelectItem value="comp">Free (comp)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Note</Label>
                <Input placeholder="Who they are" value={grantForm.note}
                  onChange={e => setGrantForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              <Button onClick={handleAddGrant} disabled={savingGrant || !grantForm.email || !grantForm.planId} style={{ backgroundColor: '#025CA8' }}>
                {savingGrant ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </Button>
            </div>
            {grantError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mt-3">{grantError}</p>}
          </div>

          <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['Email', 'Plan', 'Type', 'Note', 'Status', ''].map(h => <th key={h} className={th}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {grants.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No one pre-approved yet.</td></tr>
                )}
                {grants.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{g.email}</td>
                    <td className="px-4 py-3 text-gray-600">{planName(g.plan_id)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACCESS_STYLE[g.access_type]}`}>
                        {ACCESS_LABEL[g.access_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{g.note ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {g.claimed_at ? `Applied ${new Date(g.claimed_at).toLocaleDateString()}` : 'Waiting for signup'}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" onClick={() => handleRemoveGrant(g)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'licenses' && <LicenseLists sync={licenseSync} />}

      {/* ── Plans Tab ── */}
      {tab === 'plans' && (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Plan', 'Max RBTs', 'Email', 'Storage (GB)', 'Price (cents)', 'Stripe Price ID', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {plans.map(plan => (
                <tr key={plan.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{plan.display_name}</td>
                  <td className="px-4 py-3 text-gray-600">{plan.max_rbts}</td>
                  <td className="px-4 py-3 text-gray-600">{plan.allows_email ? '✓' : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{plan.storage_gb}</td>
                  <td className="px-4 py-3 text-gray-600">{plan.price_monthly === 0 ? 'Free' : `${plan.price_monthly}¢`}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{plan.stripe_price_id ?? <span className="italic">not set</span>}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" onClick={() => openEditPlan(plan)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Plan side sheet ── */}
      <Sheet open={!!editPlan} onOpenChange={open => { if (!open) setEditPlan(null) }}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit {editPlan?.display_name} Plan</SheetTitle></SheetHeader>
          <div className="space-y-4 px-6 py-5 flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input value={planForm.display_name ?? ''} onChange={e => setPlanForm(f => ({ ...f, display_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Max RBTs</Label>
                <Input type="number" value={planForm.max_rbts ?? ''} onChange={e => setPlanForm(f => ({ ...f, max_rbts: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price (cents/month)</Label>
                <Input type="number" value={planForm.price_monthly ?? ''} onChange={e => setPlanForm(f => ({ ...f, price_monthly: Number(e.target.value) }))} />
                <p className="text-xs text-gray-400">e.g. 2500 = $25.00</p>
              </div>
              <div className="space-y-2">
                <Label>Storage (GB)</Label>
                <Input type="number" value={planForm.storage_gb ?? ''} onChange={e => setPlanForm(f => ({ ...f, storage_gb: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stripe Price ID</Label>
              <Input placeholder="price_xxxxx" value={planForm.stripe_price_id ?? ''} onChange={e => setPlanForm(f => ({ ...f, stripe_price_id: e.target.value }))} />
              <p className="text-xs text-gray-400">From your Stripe dashboard — required for checkout to work.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allows_email"
                checked={planForm.allows_email ?? false}
                onChange={e => setPlanForm(f => ({ ...f, allows_email: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="allows_email">Includes email features</Label>
            </div>
            {planError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 px-6 py-5 flex-1">{planError}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditPlan(null)}>Cancel</Button>
            <Button onClick={handleSavePlan} disabled={savingPlan} style={{ backgroundColor: '#025CA8' }}>
              {savingPlan ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Plan'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Organization side sheet ── */}
      <Sheet open={!!editCompany} onOpenChange={open => { if (!open) setEditCompany(null) }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editCompany?.name}</SheetTitle>
            <p className="text-sm text-gray-500">{editCompany?.owner ?? 'No account owner found'}</p>
          </SheetHeader>
          <div className="space-y-4 px-6 py-5 flex-1">
            <p className="text-sm text-gray-500">
              Assigning a plan here bypasses Stripe. For a free or beta organization, pick a plan and mark the access type.
              {editCompany?.stripe_subscription_id && ' This organization has an active Stripe subscription — cancel it in Stripe first or it may overwrite this.'}
            </p>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={overridePlanId} onValueChange={v => setOverridePlanId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Access</Label>
              <Select value={accessType} onValueChange={v => setAccessType((v ?? 'paid') as 'paid' | 'beta' | 'comp')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="beta">Beta tester</SelectItem>
                  <SelectItem value="comp">Free (comp)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Input placeholder="e.g. Friend of Dana, beta through Dec" value={accessNote} onChange={e => setAccessNote(e.target.value)} />
            </div>
            {overrideError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{overrideError}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditCompany(null)}>Cancel</Button>
            <Button onClick={handleSaveOverride} disabled={savingOverride} style={{ backgroundColor: '#025CA8' }}>
              {savingOverride ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
