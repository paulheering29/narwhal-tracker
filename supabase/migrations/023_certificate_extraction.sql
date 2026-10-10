-- ============================================================
-- Migration 023 – AI "import from certificate" for outside trainings
-- ============================================================
-- certificate_extractions
--     one row per call to the model, used to enforce the yearly limit
--     (20 per person per calendar year). Failed calls count too. Only the
--     server route inserts (service role); people can read their own rows.
--     Holds no certificate contents or personal data from the file.
-- external_trainings.provider_number
--     e.g. the ACE provider number, for a future approved-providers list
-- external_trainings.certificate_name / certificate_name_mismatch
--     the name printed on the certificate, and whether it didn't match the
--     staff member, so whoever reviews the entry can see it
-- ============================================================

create table public.certificate_extractions (
  id             uuid primary key default uuid_generate_v4(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  staff_id       uuid not null references public.staff(id) on delete cascade,
  success        boolean not null,
  model          text,
  input_tokens   integer,
  output_tokens  integer,
  created_at     timestamptz not null default now()
);

alter table public.certificate_extractions enable row level security;

create policy "certificate_extractions select (self)"
  on public.certificate_extractions for select
  using (staff_id = public.jwt_staff_id());

-- No insert/update/delete policies: only the service role writes.

create index on public.certificate_extractions (staff_id, created_at);

alter table public.external_trainings
  add column if not exists provider_number            text,
  add column if not exists certificate_name           text,
  add column if not exists certificate_name_mismatch  boolean not null default false;
