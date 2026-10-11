-- One plan, a 30-day trial, and per-state nightly license checks as an add-on.
--
-- Pricing: $50/mo + $0.50 per active person + $10/mo per state checked nightly.
-- No permanent free plan: every organization starts a 30-day trial.
--
-- Access is decided in lib/billing.ts from these columns:
--   access_type beta/comp          -> always has access (set in the /owner portal)
--   stripe_subscription_id + status active/trialing/past_due -> paid
--   otherwise                      -> access until trial_ends_at
--
-- The default stamps new organizations at creation. Existing organizations get
-- a fresh 30 days from the moment this migration runs, so nobody is locked out
-- the day it ships.

alter table public.companies
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '30 days');

-- ── Single plan ──────────────────────────────────────────────────────────────
-- plans is kept (companies.plan_id and access_grants still point at it) but only
-- one row is active. Limits and prices now live in lib/billing.ts and Stripe.

insert into public.plans (name, display_name, max_rbts, allows_email, storage_gb, price_monthly, sort_order)
values ('standard', 'Training Loop', 1000000, true, 20, 5000, 1)
on conflict (name) do nothing;

update public.plans set active = false where name <> 'standard';

update public.companies
set plan_id = (select id from public.plans where name = 'standard')
where plan_id is distinct from (select id from public.plans where name = 'standard');

-- New organizations land on the single plan.
create or replace function public.provision_company_owner(
  p_auth_id      uuid,
  p_email        text,
  p_first_name   text,
  p_last_name    text,
  p_company_name text
)
returns uuid
language plpgsql as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.staff where auth_id = p_auth_id;
  if v_company is not null then
    return v_company;
  end if;

  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'Organization name is required.';
  end if;

  insert into public.companies (name, plan_id)
  values (trim(p_company_name), (select id from public.plans where name = 'standard' limit 1))
  returning id into v_company;

  insert into public.staff (company_id, auth_id, first_name, last_name, email, tier, roles, active)
  values (
    v_company, p_auth_id, coalesce(trim(p_first_name), ''), coalesce(trim(p_last_name), ''),
    lower(p_email), 'staff', array['Admin', 'Account Owner'], true
  );

  return v_company;
end;
$$;

revoke all on function public.provision_company_owner(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_company_owner(uuid, text, text, text, text) to service_role;

-- ── States an organization pays to have checked nightly ──────────────────────
-- Read by the signed-in organization (so the license badges know which states
-- are covered); written only by the server, which also adjusts the Stripe
-- quantity, so there are no insert/update policies.

create table if not exists public.company_license_states (
  company_id        uuid not null references public.companies(id) on delete cascade,
  jurisdiction_code text not null references public.license_jurisdictions(code),
  created_at        timestamptz not null default now(),
  primary key (company_id, jurisdiction_code)
);

alter table public.company_license_states enable row level security;

create policy "company_license_states readable by own company"
  on public.company_license_states for select
  using (company_id = public.jwt_company_id());

-- Organizations that already had nightly checks keep them on for the states
-- they have licenses in, through the trial, so the add-on is a choice they make
-- before it ends rather than something that silently stops.
insert into public.company_license_states (company_id, jurisdiction_code)
select distinct l.company_id, l.jurisdiction_code
from public.staff_licenses l
join public.state_license_sync s on s.jurisdiction_code = l.jurisdiction_code
where s.last_synced_at is not null
on conflict do nothing;
