-- ============================================================
-- Migration 004 – Trainings overhaul + document storage
-- ============================================================

-- 1. Add new columns to courses (trainings)
alter table public.courses
  add column if not exists date                 date,
  add column if not exists start_time           time,
  add column if not exists end_time             time,
  add column if not exists units                numeric(5,2),
  add column if not exists modality             text
    check (modality in ('in-person','online-synchronous','online-asynchronous')),
  add column if not exists trainer_staff_id     uuid
    references public.staff(id) on delete set null,
  add column if not exists trainer_name         text,
  add column if not exists trainer_cert_number  text;

-- 2. Drop active (derived from date going forward, or just not needed)
alter table public.courses
  drop column if exists active;

-- 3. Index new columns
create index if not exists courses_date_idx
  on public.courses (company_id, date desc);
create index if not exists courses_trainer_staff_id_idx
  on public.courses (trainer_staff_id);

-- ─────────────────────────────────────────────
-- 4. training_documents  (the stored file)
-- ─────────────────────────────────────────────
create table if not exists public.training_documents (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name         text not null,
  file_path    text not null,
  file_size    integer,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.training_documents enable row level security;

drop policy if exists "Tenant isolation – docs select"         on public.training_documents;
drop policy if exists "Tenant isolation – docs insert (editor+)" on public.training_documents;
drop policy if exists "Tenant isolation – docs delete (admin)" on public.training_documents;

create policy "Tenant isolation – docs select"
  on public.training_documents for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – docs insert (editor+)"
  on public.training_documents for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor')
  );

create policy "Tenant isolation – docs delete (admin)"
  on public.training_documents for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create index if not exists training_documents_company_id_idx
  on public.training_documents (company_id);

-- ─────────────────────────────────────────────
-- 5. training_document_links  (junction)
-- ─────────────────────────────────────────────
create table if not exists public.training_document_links (
  training_id  uuid not null references public.courses(id) on delete cascade,
  document_id  uuid not null references public.training_documents(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (training_id, document_id)
);

alter table public.training_document_links enable row level security;

drop policy if exists "Tenant isolation – doc links select"            on public.training_document_links;
drop policy if exists "Tenant isolation – doc links insert (editor+)"  on public.training_document_links;
drop policy if exists "Tenant isolation – doc links delete (editor+)"  on public.training_document_links;

create policy "Tenant isolation – doc links select"
  on public.training_document_links for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – doc links insert (editor+)"
  on public.training_document_links for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor')
  );

create policy "Tenant isolation – doc links delete (editor+)"
  on public.training_document_links for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor')
  );

create index if not exists training_document_links_training_id_idx
  on public.training_document_links (training_id);
create index if not exists training_document_links_document_id_idx
  on public.training_document_links (document_id);

-- ─────────────────────────────────────────────
-- 6. Supabase Storage bucket + policies
--    Creates the bucket if it doesn't exist.
--    Tenant isolation is enforced by requiring
--    the first path segment to match company_id.
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-documents',
  'training-documents',
  false,
  20971520,          -- 20 MB limit per file
  array['application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "Upload training documents" on storage.objects;
drop policy if exists "Read training documents"   on storage.objects;
drop policy if exists "Delete training documents" on storage.objects;

-- Allow authenticated users to upload into their company's folder
create policy "Upload training documents"
  on storage.objects for insert
  with check (
    bucket_id = 'training-documents'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] =
        (auth.jwt() -> 'app_metadata' ->> 'company_id')
  );

-- Allow users to read files in their company's folder
create policy "Read training documents"
  on storage.objects for select
  using (
    bucket_id = 'training-documents'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] =
        (auth.jwt() -> 'app_metadata' ->> 'company_id')
  );

-- Allow admins/editors to delete files in their company's folder
create policy "Delete training documents"
  on storage.objects for delete
  using (
    bucket_id = 'training-documents'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] =
        (auth.jwt() -> 'app_metadata' ->> 'company_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor')
  );
