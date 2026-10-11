-- ============================================================
-- Migration 031 – Documents on state licenses
-- ============================================================
-- Copies of the license itself, renewal confirmations, certificates and so on.
-- Files go in the existing private cert-cycle-documents bucket, under
-- {company_id}/license-docs/{license_id}/…, which its company-folder policies
-- already cover. Only admins, trainers and account owners add or remove them;
-- the person and staff tier can read them.
-- ============================================================

create table public.staff_license_documents (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  license_id   uuid not null references public.staff_licenses(id) on delete cascade,
  name         text not null,
  file_path    text not null,
  file_size    integer,
  mime_type    text,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index on public.staff_license_documents (company_id);
create index on public.staff_license_documents (license_id);

alter table public.staff_license_documents enable row level security;

create policy "license_documents select (self or staff tier)"
  on public.staff_license_documents for select
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

create policy "license_documents insert (admin / trainer / owner)"
  on public.staff_license_documents for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['Admin','Trainer','Account Owner']
  );

create policy "license_documents delete (admin / trainer / owner)"
  on public.staff_license_documents for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['Admin','Trainer','Account Owner']
  );
