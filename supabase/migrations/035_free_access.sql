-- Free / beta access, managed from the /owner admin portal.
--
-- companies.access_type says why an organization isn't paying:
--   paid = normal (Stripe), beta = beta tester, comp = free on purpose.
-- It's a label only; limits still come from the company's plan_id, so a comped
-- org just gets a bigger plan assigned without going through Stripe.

alter table public.companies
  add column if not exists access_type text not null default 'paid'
    check (access_type in ('paid', 'beta', 'comp')),
  add column if not exists access_note text;

-- Pre-approved emails. When someone signs up with a listed email, their new
-- organization is given the plan and access type here (see /auth/confirm).
-- Service role only: RLS on with no policies.
create table if not exists public.access_grants (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null unique,
  access_type          text not null default 'beta' check (access_type in ('beta', 'comp')),
  plan_id              uuid not null references public.plans(id),
  note                 text,
  claimed_company_id   uuid references public.companies(id) on delete set null,
  claimed_at           timestamptz,
  created_at           timestamptz not null default now()
);

alter table public.access_grants enable row level security;
