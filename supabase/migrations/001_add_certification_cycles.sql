-- ============================================================
-- Migration 001 – Certification Cycles
-- Run this in Supabase SQL editor if you already ran schema.sql
-- ============================================================

-- 1. Add EHR ID to staff
alter table public.staff
  add column if not exists ehr_id text;

-- 2. certification_cycles table
create table if not exists public.certification_cycles (
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

-- 3. Indexes
create index if not exists certification_cycles_staff_id_idx
  on public.certification_cycles (staff_id);

create index if not exists certification_cycles_company_id_idx
  on public.certification_cycles (company_id);

create index if not exists certification_cycles_staff_dates_idx
  on public.certification_cycles (staff_id, start_date, end_date);

create index if not exists training_records_staff_date_idx
  on public.training_records (staff_id, completed_date);
