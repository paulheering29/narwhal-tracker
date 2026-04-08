-- ============================================================
-- Migration 008 – Trainer signatures
-- ============================================================
-- Adds:
--   profiles.staff_id    – links a user account to their staff record
--   profiles.signature_url – URL of their saved signature image
--   storage bucket "signatures" – public bucket for signature PNGs
-- ============================================================

-- ── 1. Add columns to profiles ────────────────────────────────

alter table public.profiles
  add column if not exists staff_id      uuid references public.staff(id) on delete set null,
  add column if not exists signature_url text;

create index if not exists profiles_staff_id_idx on public.profiles (staff_id);

-- ── 2. Storage bucket ─────────────────────────────────────────
-- Public bucket so the PDF generation route can fetch images
-- without needing a signed URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signatures',
  'signatures',
  true,
  1048576,   -- 1 MB limit
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- ── 3. Storage RLS policies ───────────────────────────────────

-- Anyone (including anonymous visitors via PDF links) can read
-- signature images from this public bucket.
create policy "Public can read signatures"
  on storage.objects for select
  using (bucket_id = 'signatures');

-- Authenticated users can upload their own signature file.
-- Files must live under a folder named after their own user ID.
create policy "Users can upload own signature"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can replace (upsert) their own signature.
create policy "Users can update own signature"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own signature.
create policy "Users can delete own signature"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
