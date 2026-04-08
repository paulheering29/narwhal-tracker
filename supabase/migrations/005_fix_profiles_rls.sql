-- ============================================================
-- Migration 005 – Fix infinite recursion in profiles RLS
-- ============================================================
-- The admin policies were querying the profiles table to check
-- the user's role, causing infinite recursion. Replace all
-- role checks with JWT app_metadata claims instead.
-- ============================================================

-- Drop the recursive policies
drop policy if exists "Admins can read company profiles"   on public.profiles;
drop policy if exists "Admins can update company profiles" on public.profiles;
drop policy if exists "Admins can insert company profiles" on public.profiles;

-- Re-create using JWT claims (no table self-reference)
create policy "Admins can read company profiles"
  on public.profiles for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and company_id = public.jwt_company_id()
  );

create policy "Admins can update company profiles"
  on public.profiles for update
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and company_id = public.jwt_company_id()
  );

create policy "Admins can insert company profiles"
  on public.profiles for insert
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and company_id = public.jwt_company_id()
  );
