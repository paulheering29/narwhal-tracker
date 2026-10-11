import { createServiceClient } from '@/lib/supabase/service'
import { OwnerClient } from './client'

export default async function OwnerPage() {
  const service = createServiceClient()

  const [plansRes, companiesRes, staffRes, grantsRes] = await Promise.all([
    service.from('plans').select('*').order('sort_order'),
    service
      .from('companies')
      .select('id, name, created_at, subscription_status, access_type, access_note, plan:plan_id(id, name, display_name), stripe_customer_id, stripe_subscription_id')
      .order('created_at', { ascending: false }),
    service.from('staff').select('company_id, tier, roles, active, email, first_name, last_name'),
    service.from('access_grants').select('*').order('created_at', { ascending: false }),
  ])

  // One pass over staff gives every org's headcount and its Account Owner contact.
  type Stats = { staff: number; rbts: number; owner: string | null }
  const stats = new Map<string, Stats>()
  for (const s of staffRes.data ?? []) {
    if (!s.company_id || !s.active) continue
    const cur = stats.get(s.company_id) ?? { staff: 0, rbts: 0, owner: null }
    if (s.tier === 'rbt') cur.rbts++; else cur.staff++
    if (!cur.owner && (s.roles ?? []).includes('Account Owner')) {
      cur.owner = `${s.first_name} ${s.last_name}${s.email ? ` · ${s.email}` : ''}`
    }
    stats.set(s.company_id, cur)
  }

  // Supabase returns joined relations as arrays — unwrap plan to a single object
  const companies = (companiesRes.data ?? []).map(c => ({
    ...c,
    plan: Array.isArray(c.plan) ? (c.plan[0] ?? null) : c.plan,
    ...(stats.get(c.id) ?? { staff: 0, rbts: 0, owner: null }),
  }))

  return (
    <OwnerClient
      initialPlans={plansRes.data ?? []}
      initialCompanies={companies}
      initialGrants={grantsRes.data ?? []}
    />
  )
}
