import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AdminUsersClient } from './client'
import { canManageUsers } from '@/lib/permissions'
import { getBillingSummary } from '@/lib/billing'
import { SUPPORTED_STATE_CODES } from '@/lib/license-check/sources'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('staff')
    .select('tier, roles, company_id')
    .eq('auth_id', user.id)
    .single()

  if (!me || !canManageUsers(me.roles ?? [])) redirect('/dashboard')

  // Companies has a blanket "no direct user access" RLS policy, so use the
  // service client to fetch the caller's own company name.
  const service = createServiceClient()
  const companyPromise = service
    .from('companies')
    .select('id, name, logo_url, org_contact_staff_id, preferred_cert_template, enabled_cert_templates, external_training_credentials, external_training_review, license_reminders_enabled, license_check_email_enabled, session_timeout_minutes')
    .eq('id', me.company_id)
    .single()

  const [{ data: staff }, { data: topics }, { data: company }, billing, { data: jurisdictions }, { data: credentialTypes }] = await Promise.all([
    supabase
      .from('staff')
      .select('id, auth_id, first_name, last_name, display_first_name, display_last_name, email, role, ehr_id, active, tier, roles, certification_number, credentials, license_check_email')
      .eq('company_id', me.company_id)
      .order('last_name'),
    supabase
      .from('topics')
      .select('id, name, created_at')
      .order('name'),
    companyPromise,
    getBillingSummary(me.company_id),
    supabase.from('license_jurisdictions').select('code, name').in('code', SUPPORTED_STATE_CODES).order('name'),
    supabase.from('credential_types').select('code, unit_label').order('sort_order'),
  ])

  // How many certificate imports each person has used this year (the log is
  // service-role only). Only the Account Owner's tab shows it.
  const importUsage: Record<string, number> = {}
  if ((me.roles ?? []).includes('Account Owner')) {
    const { data: imports } = await service
      .from('certificate_extractions')
      .select('staff_id')
      .eq('company_id', me.company_id)
      .gte('created_at', `${new Date().getUTCFullYear()}-01-01T00:00:00Z`)
    for (const row of imports ?? []) {
      const id = row.staff_id as string
      importUsage[id] = (importUsage[id] ?? 0) + 1
    }
  }

  return (
    <AdminUsersClient
      currentAuthId={user.id}
      currentRoles={me.roles ?? []}
      initialStaff={staff ?? []}
      initialTopics={topics ?? []}
      initialCompany={company ?? { id: me.company_id, name: '' }}
      billing={billing}
      supportedStates={jurisdictions ?? []}
      credentialTypes={credentialTypes ?? []}
      importUsage={importUsage}
    />
  )
}
