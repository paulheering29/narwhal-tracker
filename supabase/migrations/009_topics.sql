-- ============================================================
-- Migration 009 – Topics
-- ============================================================
-- Adds a per-company topics table and links it to courses.
-- Deletion is blocked at the DB level if a topic is in use.
-- ============================================================

-- ── 1. topics table ───────────────────────────────────────────

create table public.topics (
  id         uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  constraint topics_company_name_unique unique (company_id, name)
);

alter table public.topics enable row level security;

create index if not exists topics_company_id_idx on public.topics (company_id);

-- ── 2. RLS ────────────────────────────────────────────────────

create policy "Tenant isolation – topics select"
  on public.topics for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – topics insert (staff tier)"
  on public.topics for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – topics update (staff tier)"
  on public.topics for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

-- Only admins can delete topics (app layer also blocks if in use)
create policy "Tenant isolation – topics delete (admin role)"
  on public.topics for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

-- ── 3. Add topic_id to courses ────────────────────────────────
-- ON DELETE RESTRICT means the DB will refuse to delete a topic
-- that is referenced by any course row (app layer checks first
-- and shows a friendly error, but this is the safety net).

alter table public.courses
  add column if not exists topic_id uuid
    references public.topics(id) on delete restrict;

create index if not exists courses_topic_id_idx on public.courses (topic_id);
