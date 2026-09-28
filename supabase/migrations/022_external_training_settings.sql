-- ============================================================
-- Migration 022 – Company settings + review for outside trainings
-- ============================================================
-- companies.external_training_credentials
--     which credentials may add their own outside trainings
--     ('{BCBA}' = BCBAs only, '{RBT,BCBA}' = both, '{}' = nobody)
-- companies.external_training_review
--     when true, trainings people add for themselves start as 'pending'
--     for the team to mark approved / not approved
-- external_trainings.review_status
--     'pending' and 'approved' count toward totals; 'not_approved' stays
--     visible to the person but doesn't count
--
-- The rules are enforced in a trigger, not just the UI, so nobody can
-- approve their own entry or add one their company doesn't allow.
-- ============================================================

alter table public.companies
  add column if not exists external_training_credentials text[] not null default '{BCBA}',
  add column if not exists external_training_review      boolean not null default false;

alter table public.external_trainings
  add column if not exists review_status text not null default 'approved'
    check (review_status in ('pending', 'approved', 'not_approved')),
  add column if not exists reviewed_by  uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at  timestamptz;

create index if not exists external_trainings_review_idx
  on public.external_trainings (company_id, review_status);

-- Companies are hidden from users by RLS, so expose just these two settings
-- for the caller's own company.
create or replace function public.my_external_training_settings()
returns table (allowed_credentials text[], review_required boolean)
language sql stable security definer
set search_path = public
as $$
  select external_training_credentials, external_training_review
  from public.companies
  where id = public.jwt_company_id();
$$;

grant execute on function public.my_external_training_settings() to authenticated;

create or replace function public.external_trainings_guard()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_allowed text[];
  v_review  boolean;
  v_role    text;
  v_is_self boolean := new.staff_id = public.jwt_staff_id();
begin
  -- Server-side jobs (service role) aren't restricted.
  if auth.role() = 'service_role' then
    return new;
  end if;

  select external_training_credentials, external_training_review
    into v_allowed, v_review
    from public.companies where id = new.company_id;

  if tg_op = 'INSERT' then
    if v_is_self then
      select upper(role) into v_role from public.staff where id = new.staff_id;
      if v_role is null or not (v_role = any (v_allowed)) then
        raise exception 'Your organization doesn''t allow % staff to add outside trainings.', coalesce(v_role, 'these');
      end if;
      new.review_status := case when v_review then 'pending' else 'approved' end;
      new.reviewed_by   := null;
      new.reviewed_at   := null;
    else
      -- Added by an admin on someone's behalf: already vetted.
      new.review_status := 'approved';
      new.reviewed_by   := auth.uid();
      new.reviewed_at   := now();
    end if;
    return new;
  end if;

  -- UPDATE
  if v_is_self then
    -- Nobody reviews their own entry. If they change what they claimed
    -- and review is on, it goes back in the queue.
    new.review_status := old.review_status;
    new.reviewed_by   := old.reviewed_by;
    new.reviewed_at   := old.reviewed_at;
    if v_review and (
      new.units, new.ethics_units, new.supervision_units, new.completed_date, new.name, new.certificate_path
    ) is distinct from (
      old.units, old.ethics_units, old.supervision_units, old.completed_date, old.name, old.certificate_path
    ) then
      new.review_status := 'pending';
      new.reviewed_by   := null;
      new.reviewed_at   := null;
    end if;
  elsif new.review_status is distinct from old.review_status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists external_trainings_guard on public.external_trainings;
create trigger external_trainings_guard
  before insert or update on public.external_trainings
  for each row execute function public.external_trainings_guard();
