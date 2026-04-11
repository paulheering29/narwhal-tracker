-- ============================================================
-- Migration 014 – Certification cycle documents
-- Adds ability to attach files (images / PDFs) to cert cycles.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. certification_cycle_documents table
-- ─────────────────────────────────────────────
create table if not exists public.certification_cycle_documents (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  cycle_id     uuid not null references public.certification_cycles(id) on delete cascade,
  name         text not null,
  file_path    text not null,
  file_size    integer,
  mime_type    text,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.certification_cycle_documents enable row level security;

drop policy if exists "Tenant isolation – cycle docs select" on public.certification_cycle_documents;
drop policy if exists "Tenant isolation – cycle docs insert" on public.certification_cycle_documents;
drop policy if exists "Tenant isolation – cycle docs delete" on public.certification_cycle_documents;

create policy "Tenant isolation – cycle docs select"
  on public.certification_cycle_documents for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – cycle docs insert"
  on public.certification_cycle_documents for insert
  with check (company_id = public.jwt_company_id());

create policy "Tenant isolation – cycle docs delete"
  on public.certification_cycle_documents for delete
  using (company_id = public.jwt_company_id());

create index if not exists cert_cycle_documents_cycle_id_idx
  on public.certification_cycle_documents (cycle_id);
create index if not exists cert_cycle_documents_company_id_idx
  on public.certification_cycle_documents (company_id);

-- ─────────────────────────────────────────────
-- 2. Supabase Storage bucket + policies
--    File path format: {company_id}/{cycle_id}/{uuid}.{ext}
--    Tenant isolation via first path segment.
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cert-cycle-documents',
  'cert-cycle-documents',
  false,
  10485760,          -- 10 MB limit per file (images are client-compressed)
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

drop policy if exists "Upload cert cycle documents" on storage.objects;
drop policy if exists "Read cert cycle documents"   on storage.objects;
drop policy if exists "Delete cert cycle documents" on storage.objects;

-- Allow authenticated users to upload into their company's folder
create policy "Upload cert cycle documents"
  on storage.objects for insert
  with check (
    bucket_id = 'cert-cycle-documents'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] =
        (auth.jwt() -> 'app_metadata' ->> 'company_id')
  );

-- Allow users to read files in their company's folder
create policy "Read cert cycle documents"
  on storage.objects for select
  using (
    bucket_id = 'cert-cycle-documents'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] =
        (auth.jwt() -> 'app_metadata' ->> 'company_id')
  );

-- Allow users to delete files in their company's folder
create policy "Delete cert cycle documents"
  on storage.objects for delete
  using (
    bucket_id = 'cert-cycle-documents'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] =
        (auth.jwt() -> 'app_metadata' ->> 'company_id')
  );
