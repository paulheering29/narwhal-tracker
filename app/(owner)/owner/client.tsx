'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Pencil, Building2, Tag } from 'lucide-react'

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
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: { id: string; name: string; display_name: string } | null
}

type Props = {
  initialPlans: Plan[]
  initialCompanies: Company[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OwnerClient({ initialPlans, initialCompanies }: Props) {
  const supabase = createClient()
  const [plans, setPlans]         = useState<Plan[]>(initialPlans)
  const [companies]               = useState<Company[]>(initialCompanies)
  const [tab, setTab]             = useState<'plans' | 'companies'>('plans')

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
    setOverrideError(null)
  }

  async function handleSaveOverride() {
    if (!editCompany) return
    setSavingOverride(true)
    setOverrideError(null)

    const res = await fetch('/api/owner/update-company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: editCompany.id,
        updates: { plan_id: overridePlanId || null },
      }),
    })
    const json = await res.json()
    if (json.error) { setOverrideError(json.error); setSavingOverride(false); return }

    setSavingOverride(false)
    setEditCompany(null)
    window.location.reload()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Owner Admin</h1>
      <p className="text-sm text-gray-500 mb-8">Manage plans and company subscriptions.</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 border-b">
        {(['plans', 'companies'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? 'border-[#457595] text-[#457595]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'plans' ? <Tag className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
            {t === 'plans' ? 'Plans' : 'Companies'}
          </button>
        ))}
      </div>

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

      {/* ── Companies Tab ── */}
      {tab === 'companies' && (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Company', 'Plan', 'Status', 'Stripe Customer', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map(company => (
                <tr key={company.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{company.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      company.plan?.name === 'pro' ? 'bg-violet-100 text-violet-700' :
                      company.plan?.name === 'starter' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {company.plan?.display_name ?? 'No plan'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{company.subscription_status}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{company.stripe_customer_id ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" onClick={() => openOverride(company)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Plan Dialog ── */}
      <Dialog open={!!editPlan} onOpenChange={open => { if (!open) setEditPlan(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {editPlan?.display_name} Plan</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
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
            {planError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{planError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlan(null)}>Cancel</Button>
            <Button onClick={handleSavePlan} disabled={savingPlan} style={{ backgroundColor: '#457595' }}>
              {savingPlan ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Override Company Plan Dialog ── */}
      <Dialog open={!!editCompany} onOpenChange={open => { if (!open) setEditCompany(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Override Plan — {editCompany?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-500">Manually assign a plan to this company, bypassing Stripe.</p>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={overridePlanId} onValueChange={v => setOverridePlanId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {overrideError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{overrideError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCompany(null)}>Cancel</Button>
            <Button onClick={handleSaveOverride} disabled={savingOverride} style={{ backgroundColor: '#457595' }}>
              {savingOverride ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
