-- ============================================================
-- Migration 012 – Merge profiles into staff (unified identity table)
-- ============================================================
-- Before: profiles (login users) + staff (people being tracked) were two
--         separate tables, joined by an optional profiles.staff_id link.
--         This caused constant confusion: trainers needed a staff record
--         AND a profile AND the link set between them, or signatures
--         would silently fail to appear on certificates.
--
-- After:  single `staff` table. Everyone lives here. If they have a login,
--         their auth.users.id lives in staff.auth_id. If they don't yet,
--         auth_id is null. One row per person. No linking required.
--
-- After running: ALL users must sign out and back in so the JWT is
-- refreshed with the new app_metadata fields from the new trigger.
-- ============================================================

-- ── 1. Add new columns to staff ───────────────────────────────
alter table public.staff
  add column if not exists auth_id       uuid references auth.users(id) on delete set null,
  add column if not exists tier          text check (tier in ('rbt','staff')),
  add column if not exists roles         text[] not null default '{}',
  add column if not exists signature_url text,
  add column if not exists is_owner      boolean not null default false;

create unique index if not exists staff_auth_id_idx
  on public.staff(auth_id) where auth_id is not null;

-- ── 2. Migrate existing profile data → staff rows ─────────────
-- For profiles already linked via staff_id: copy onto that staff row.
update public.staff s set
  auth_id       = p.id,
  tier          = p.tier,
  roles         = p.roles,
  signature_url = p.signature_url,
  is_owner      = coalesce(p.is_owner, false)
from public.profiles p
where p.staff_id = s.id;

-- For profiles with no staff_id link: create a fresh staff row for them.
insert into public.staff (
  company_id, first_name, last_name, auth_id, tier, roles,
  signature_url, is_owner, role, active
)
select
  p.company_id,
  coalesce(p.first_name, ''),
  coalesce(p.last_name,  ''),
  p.id,
  p.tier,
  p.roles,
  p.signature_url,
  coalesce(p.is_owner, false),
  case
    when p.tier = 'rbt' then 'RBT'
    when 'Admin'   = any(p.roles) then 'Admin'
    when 'Trainer' = any(p.roles) then 'Trainer'
    else null
  end,
  true
from public.profiles p
where p.staff_id is null
  and not exists (select 1 from public.staff s2 where s2.auth_id = p.id);

-- ── 3. New JWT sync trigger – reads from staff instead of profiles ─
create or replace function public.sync_staff_to_jwt()
returns trigger language plpgsql security definer as $$
begin
  if new.auth_id is null then
    return new;
  end if;
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
        'company_id', new.company_id,
        'tier',       coalesce(new.tier, 'rbt'),
        'roles',      to_jsonb(coalesce(new.roles, '{}'::text[]))
      )
  where id = new.auth_id;
  return new;
end;
$$;

drop trigger if exists on_profile_change  on public.profiles;
drop trigger if exists on_staff_auth_sync on public.staff;

create trigger on_staff_auth_sync
  after insert or update of auth_id, company_id, tier, roles on public.staff
  for each row execute function public.sync_staff_to_jwt();

-- Fire it once for every staff row that already has an auth_id so
-- their app_metadata is refreshed from the new source of truth.
update public.staff set auth_id = auth_id where auth_id is not null;

-- Backfill tier for any staff row that still has it null, based on the
-- existing job-title `role` field. RBT→rbt, everything else→staff.
update public.staff
set tier = case when role = 'RBT' then 'rbt' else 'staff' end
where tier is null;

-- ── 4. Staff RLS – add self-access via auth_id ───────────────
-- Drop old staff policies and rewrite. The key addition is that any
-- authenticated user can always read/update their own staff row via
-- auth_id = auth.uid(), even before their JWT company_id is populated.

drop policy if exists "Tenant isolation – staff select"              on public.staff;
drop policy if exists "Tenant isolation – staff insert (staff tier)" on public.staff;
drop policy if exists "Tenant isolation – staff update (staff tier)" on public.staff;
drop policy if exists "Tenant isolation – staff delete (admin role)" on public.staff;

-- Everyone can read their own staff row (needed for first-login before JWT)
create policy "Staff self read"
  on public.staff for select
  using (auth_id = auth.uid());

-- Everyone can update their own staff row (signature, etc.)
create policy "Staff self update"
  on public.staff for update
  using (auth_id = auth.uid());

-- Staff-tier users can read the whole company
create policy "Tenant isolation – staff select"
  on public.staff for select
  using (company_id = public.jwt_company_id());

-- Staff-tier can insert new staff in their company
create policy "Tenant isolation – staff insert"
  on public.staff for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

-- Staff-tier can update any staff row in their company
create policy "Tenant isolation – staff update"
  on public.staff for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

-- Admins can delete
create policy "Tenant isolation – staff delete"
  on public.staff for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

-- ── 5. Drop profiles table ────────────────────────────────────
drop function if exists public.sync_profile_to_jwt() cascade;
drop table if exists public.profiles cascade;
