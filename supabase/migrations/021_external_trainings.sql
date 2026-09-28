-- ============================================================
-- Migration 021 – Trainings earned outside the company
-- ============================================================
-- A conference, another ACE provider's course, etc. The person enters it
-- themselves (optionally attaching the certificate as proof) and it counts
-- toward their own credential's cycle, including ethics / supervision.
--
-- Kept out of `courses` / `training_records` on purpose: those are the
-- company's own trainings, with attendees, trainers and certificates we
-- generate. An outside training has one person and a certificate someone
-- else issued.
--
-- Certificates reuse the existing private 'cert-cycle-documents' bucket
-- under {company_id}/external/{staff_id}/…, which its company-folder
-- policies already cover.
-- ============================================================

create table public.external_trainings (
  id                 uuid primary key default uuid_generate_v4(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  staff_id           uuid not null references public.staff(id) on delete cascade,
  name               text not null,
  provider           text,
  completed_date     date not null,
  units              numeric(5,2) not null check (units > 0),
  ethics_units       numeric(5,2) not null default 0 check (ethics_units >= 0 and ethics_units <= units),
  supervision_units  numeric(5,2) not null default 0 check (supervision_units >= 0 and supervision_units <= units),
  certificate_path   text,
  notes              text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now()
);

alter table public.external_trainings enable row level security;

-- The person themselves, plus anyone with staff-tier access in the company
-- (so admins can see and correct them on the staff page).
create policy "external_trainings select (self or staff tier)"
  on public.external_trainings for select
  using (
    staff_id = public.jwt_staff_id()
    or (company_id = public.jwt_company_id() and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff')
  );

create policy "external_trainings insert (self or staff tier)"
  on public.external_trainings for insert
  with check (
    company_id = public.jwt_company_id()
    and (staff_id = public.jwt_staff_id() or (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff')
  );

create policy "external_trainings update (self or staff tier)"
  on public.external_trainings for update
  using (
    staff_id = public.jwt_staff_id()
    or (company_id = public.jwt_company_id() and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff')
  );

create policy "external_trainings delete (self or staff tier)"
  on public.external_trainings for delete
  using (
    staff_id = public.jwt_staff_id()
    or (company_id = public.jwt_company_id() and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff')
  );

create index on public.external_trainings (company_id);
create index on public.external_trainings (staff_id, completed_date);
