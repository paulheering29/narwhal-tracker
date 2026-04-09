-- Migration 011: Plans table, company billing fields, owner flag
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Plans table ────────────────────────────────────────────────────────────

create table public.plans (
  id                uuid    primary key default uuid_generate_v4(),
  name              text    not null unique,          -- 'free' | 'starter' | 'pro'
  display_name      text    not null,                 -- 'Free' | 'Starter' | 'Pro'
  max_rbts          int     not null default 5,
  allows_email      boolean not null default false,
  storage_gb        numeric(10,2) not null default 0,
  price_monthly     int     not null default 0,       -- cents  (0 = free)
  stripe_price_id   text,                             -- set after Stripe product setup
  sort_order        int     not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Anyone authenticated can read plans (needed for billing page, upgrade prompts)
alter table public.plans enable row level security;
create policy "plans_select" on public.plans
  for select to authenticated using (true);

-- Seed the three tiers
insert into public.plans (name, display_name, max_rbts, allows_email, storage_gb, price_monthly, sort_order)
values
  ('free',    'Free',    5,   false, 0,  0,    1),
  ('starter', 'Starter', 50,  true,  5,  2500, 2),
  ('pro',     'Pro',     100, true,  20, 5000, 3);


-- ── 2. Billing columns on companies ──────────────────────────────────────────

alter table public.companies
  add column if not exists plan_id                uuid references public.plans(id),
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status    text not null default 'active';

-- Put every existing company on the free plan
update public.companies
set plan_id = (select id from public.plans where name = 'free' limit 1)
where plan_id is null;


-- ── 3. Owner flag on profiles ─────────────────────────────────────────────────
-- Profiles with is_owner = true can access the /owner super-admin panel.
-- Set this manually in Supabase for your own account.

alter table public.profiles
  add column if not exists is_owner boolean not null default false;
