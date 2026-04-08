-- ============================================================
-- Migration 007 – Multi-role permissions system
-- ============================================================
-- Replaces the single `role` column (admin/editor/viewer) with:
--   tier  text  – 'rbt' | 'staff'  (RLS security boundary)
--   roles text[] – ['Trainer','Admin','Account Owner'] etc.
--
-- Tier is the hard DB-level wall:
--   rbt   → can only see/touch their own data
--   staff → broad read, writes gated by roles in the app layer
--
-- Roles are app-layer permissions stored as an array so one
-- person can hold multiple (e.g. ['Trainer','Admin']).
--
-- After running this migration ALL USERS MUST SIGN OUT AND BACK IN
-- so their JWT is refreshed with the new app_metadata fields.
-- ============================================================

-- ── 1. Add new columns ────────────────────────────────────────

alter table public.profiles
  add column if not exists tier  text not null default 'staff'
    check (tier in ('rbt', 'staff')),
  add column if not exists roles text[] not null default '{}';

-- ── 2. Migrate existing role data ─────────────────────────────
--   viewer → rbt  tier, no roles
--   editor → staff tier, ['Trainer']
--   admin  → staff tier, ['Admin']

update public.profiles set
  tier  = case when role = 'viewer' then 'rbt' else 'staff' end,
  roles = case
    when role = 'admin'  then array['Admin']::text[]
    when role = 'editor' then array['Trainer']::text[]
    else                      array[]::text[]
  end;

-- ── 3. Drop old role column ────────────────────────────────────

alter table public.profiles drop column if exists role;

-- ── 4. Update JWT sync trigger ─────────────────────────────────
-- Now writes tier + roles instead of role into app_metadata.

create or replace function public.sync_profile_to_jwt()
returns trigger language plpgsql security definer as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
        'company_id', new.company_id,
        'tier',       new.tier,
        'roles',      to_jsonb(new.roles)
      )
  where id = new.id;
  return new;
end;
$$;

-- ── 5. Refresh app_metadata for all existing users ─────────────
-- Fires the trigger for every existing profile row so their stored
-- app_metadata is updated. Sessions still need a re-login to pick
-- up the new JWT claims.

update public.profiles set tier = tier;

-- ── 6. Profiles RLS ────────────────────────────────────────────

drop policy if exists "Admins can read company profiles"   on public.profiles;
drop policy if exists "Admins can update company profiles" on public.profiles;
drop policy if exists "Admins can insert company profiles" on public.profiles;
drop policy if exists "Staff can read company profiles"    on public.profiles;

-- All staff-tier users can read every profile in their company
create policy "Staff can read company profiles"
  on public.profiles for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
    and company_id = public.jwt_company_id()
  );

-- Only admins can update profiles in their company
create policy "Admins can update company profiles"
  on public.profiles for update
  using (
    (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
    and company_id = public.jwt_company_id()
  );

-- Only admins can insert (create) profiles in their company
create policy "Admins can insert company profiles"
  on public.profiles for insert
  with check (
    (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
    and company_id = public.jwt_company_id()
  );

-- ── 7. Staff table RLS ─────────────────────────────────────────

drop policy if exists "Tenant isolation – staff insert (editor+)" on public.staff;
drop policy if exists "Tenant isolation – staff update (editor+)" on public.staff;
drop policy if exists "Tenant isolation – staff delete (admin)"   on public.staff;

create policy "Tenant isolation – staff insert (staff tier)"
  on public.staff for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – staff update (staff tier)"
  on public.staff for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – staff delete (admin role)"
  on public.staff for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

-- ── 8. Courses table RLS ───────────────────────────────────────

drop policy if exists "Tenant isolation – courses insert (editor+)" on public.courses;
drop policy if exists "Tenant isolation – courses update (editor+)" on public.courses;
drop policy if exists "Tenant isolation – courses delete (admin)"   on public.courses;

create policy "Tenant isolation – courses insert (staff tier)"
  on public.courses for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – courses update (staff tier)"
  on public.courses for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – courses delete (admin role)"
  on public.courses for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

-- ── 9. Training records RLS ────────────────────────────────────

drop policy if exists "Tenant isolation – records insert (editor+)" on public.training_records;
drop policy if exists "Tenant isolation – records update (editor+)" on public.training_records;
drop policy if exists "Tenant isolation – records delete (admin)"   on public.training_records;

create policy "Tenant isolation – records insert (staff tier)"
  on public.training_records for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – records update (staff tier)"
  on public.training_records for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – records delete (admin role)"
  on public.training_records for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

-- ── 10. Certification cycles RLS ──────────────────────────────

drop policy if exists "Tenant isolation – cycles insert (editor+)" on public.certification_cycles;
drop policy if exists "Tenant isolation – cycles update (editor+)" on public.certification_cycles;
drop policy if exists "Tenant isolation – cycles delete (admin)"   on public.certification_cycles;

create policy "Tenant isolation – cycles insert (staff tier)"
  on public.certification_cycles for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – cycles update (staff tier)"
  on public.certification_cycles for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – cycles delete (admin role)"
  on public.certification_cycles for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

-- ── 11. Training documents RLS (from migration 004) ───────────

drop policy if exists "Tenant isolation – training_documents insert (editor+)" on public.training_documents;
drop policy if exists "Tenant isolation – training_documents delete (admin)"   on public.training_documents;
drop policy if exists "Tenant isolation – doc_links insert (editor+)"          on public.training_document_links;
drop policy if exists "Tenant isolation – doc_links delete (editor+)"          on public.training_document_links;

create policy "Tenant isolation – training_documents insert (staff tier)"
  on public.training_documents for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – training_documents delete (admin role)"
  on public.training_documents for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

create policy "Tenant isolation – doc_links insert (staff tier)"
  on public.training_document_links for insert
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – doc_links delete (staff tier)"
  on public.training_document_links for delete
  using (
    (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );
