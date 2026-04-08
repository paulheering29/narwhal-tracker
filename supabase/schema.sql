-- ============================================================
-- Narwhal PDU Tracker – Database Schema
-- Run this in the Supabase SQL editor for a fresh project.
-- ============================================================

-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- companies
-- ─────────────────────────────────────────────
create table public.companies (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;

-- Only service-role / admin functions touch this table directly;
-- regular users never need to query it (they get company_id from their JWT).
create policy "No direct user access to companies"
  on public.companies
  for all
  using (false);

-- ─────────────────────────────────────────────
-- profiles  (extends auth.users)
-- ─────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  company_id   uuid not null references public.companies (id) on delete cascade,
  role         text not null check (role in ('admin', 'editor', 'viewer')) default 'viewer',
  first_name   text,
  last_name    text
);

alter table public.profiles enable row level security;

-- Users can read/update their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Admins can read all profiles in their company
create policy "Admins can read company profiles"
  on public.profiles for select
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    and company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- Admins can update profiles in their company
create policy "Admins can update company profiles"
  on public.profiles for update
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    and company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- Admins can insert profiles for their company (inviting users)
create policy "Admins can insert company profiles"
  on public.profiles for insert
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    and company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- Helper: extract company_id from JWT claim
-- ─────────────────────────────────────────────
-- We store company_id in the JWT via a custom claim set by the
-- trigger below. This avoids a round-trip to profiles on every RLS check.

create or replace function public.jwt_company_id()
returns uuid language sql stable
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid;
$$;

-- ─────────────────────────────────────────────
-- Trigger: populate JWT app_metadata on profile insert/update
-- (Supabase exposes auth.users.raw_app_meta_data in the JWT)
-- ─────────────────────────────────────────────
create or replace function public.sync_profile_to_jwt()
returns trigger language plpgsql security definer
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
        'company_id', new.company_id,
        'role',       new.role
      )
  where id = new.id;
  return new;
end;
$$;

create trigger on_profile_change
  after insert or update on public.profiles
  for each row execute function public.sync_profile_to_jwt();

-- ─────────────────────────────────────────────
-- staff
-- ─────────────────────────────────────────────
create table public.staff (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  first_name   text not null,
  last_name    text not null,
  email              text,
  role               text,
  display_first_name text,        -- preferred/goes-by name, null = use first_name
  display_last_name  text,        -- preferred/goes-by last name, null = use last_name
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

alter table public.staff enable row level security;

create policy "Tenant isolation – staff select"
  on public.staff for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – staff insert (editor+)"
  on public.staff for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );

create policy "Tenant isolation – staff update (editor+)"
  on public.staff for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );

create policy "Tenant isolation – staff delete (admin)"
  on public.staff for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ─────────────────────────────────────────────
-- courses
-- ─────────────────────────────────────────────
create table public.courses (
  id               uuid primary key default uuid_generate_v4(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  name             text not null,
  description      text,
  validity_months  integer,           -- null = no expiry
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table public.courses enable row level security;

create policy "Tenant isolation – courses select"
  on public.courses for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – courses insert (editor+)"
  on public.courses for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );

create policy "Tenant isolation – courses update (editor+)"
  on public.courses for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );

create policy "Tenant isolation – courses delete (admin)"
  on public.courses for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ─────────────────────────────────────────────
-- training_records
-- ─────────────────────────────────────────────
create table public.training_records (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  staff_id        uuid not null references public.staff (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  completed_date  date not null,
  expiry_date     date,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table public.training_records enable row level security;

create policy "Tenant isolation – records select"
  on public.training_records for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – records insert (editor+)"
  on public.training_records for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );

create policy "Tenant isolation – records update (editor+)"
  on public.training_records for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );

create policy "Tenant isolation – records delete (admin)"
  on public.training_records for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
create index on public.staff (company_id);

-- ehr_id added in migration 001
create index on public.courses (company_id);
create index on public.training_records (company_id);
create index on public.training_records (staff_id);
create index on public.training_records (course_id);
create index on public.training_records (expiry_date);
create index on public.training_records (staff_id, completed_date);

-- ─────────────────────────────────────────────
-- certification_cycles
-- ─────────────────────────────────────────────
create table public.certification_cycles (
  id                   uuid primary key default uuid_generate_v4(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  staff_id             uuid not null references public.staff (id) on delete cascade,
  certification_type   text not null check (certification_type in ('RBT', 'BCBA')),
  certification_number text not null,
  start_date           date not null,
  end_date             date not null,
  notes                text,
  created_at           timestamptz not null default now(),
  constraint valid_cycle_dates check (end_date > start_date)
);

alter table public.certification_cycles enable row level security;

create policy "Tenant isolation – cycles select"
  on public.certification_cycles for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – cycles insert (editor+)"
  on public.certification_cycles for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );

create policy "Tenant isolation – cycles update (editor+)"
  on public.certification_cycles for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );

create policy "Tenant isolation – cycles delete (admin)"
  on public.certification_cycles for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create index on public.certification_cycles (staff_id);
create index on public.certification_cycles (company_id);
create index on public.certification_cycles (staff_id, start_date, end_date);
