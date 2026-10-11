-- ============================================================
-- Migration 029 – State licensure, phase 2: CE hours and topic checklists
-- ============================================================
-- State CE hours are worked out from the person's confirmed trainings and
-- approved outside trainings (nothing new is stored for them). What's added:
--
-- staff_licenses.ce_exempt_this_cycle     first renewals are often exempt
--                                         (IL, VA) or prorated (AZ)
-- staff_licenses.ce_hours_override        hours owed this cycle, when it differs
--                                         from the state's standard
-- staff_licenses.ce_period_end            where the CE reporting period ends when
--                                         that isn't the license expiration
--                                         (LA and MT renew yearly but report
--                                         CE every two years)
-- staff_license_topic_completions         a required topic (human trafficking
--                                         prevention, suicide prevention, …) done
--                                         on a date, with an optional certificate
--                                         in the existing private
--                                         cert-cycle-documents bucket, under
--                                         {company_id}/license/{staff_id}/…
-- ============================================================

alter table public.staff_licenses
  add column if not exists ce_exempt_this_cycle boolean not null default false,
  add column if not exists ce_hours_override    numeric(6,2) check (ce_hours_override is null or ce_hours_override >= 0),
  add column if not exists ce_period_end        date;

create table public.staff_license_topic_completions (
  id               uuid primary key default uuid_generate_v4(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  license_id       uuid not null references public.staff_licenses(id) on delete cascade,
  topic_id         uuid not null references public.license_requirement_topics(id) on delete cascade,
  completed_date   date not null,
  certificate_path text,
  notes            text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index on public.staff_license_topic_completions (company_id);
create index on public.staff_license_topic_completions (license_id);
create index on public.staff_license_topic_completions (topic_id);

alter table public.staff_license_topic_completions enable row level security;

-- Same visibility as the license itself: the person, or staff tier in the company.
create policy "license_topic_completions select (self or staff tier)"
  on public.staff_license_topic_completions for select
  using (
    company_id = public.jwt_company_id()
    and (
      (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
      or exists (
        select 1 from public.staff_licenses l
        where l.id = license_id and l.staff_id = public.jwt_staff_id()
      )
    )
  );

create policy "license_topic_completions insert (admin / trainer / owner)"
  on public.staff_license_topic_completions for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['Admin','Trainer','Account Owner']
  );

create policy "license_topic_completions update (admin / trainer / owner)"
  on public.staff_license_topic_completions for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['Admin','Trainer','Account Owner']
  );

create policy "license_topic_completions delete (admin / trainer / owner)"
  on public.staff_license_topic_completions for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['Admin','Trainer','Account Owner']
  );
