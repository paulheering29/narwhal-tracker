-- ============================================================
-- Migration 025 – Learning paths
-- ============================================================
-- A path is an ordered set of self-paced (streamed) courses that can be
-- assigned to a person as one unit. It is a layer on top of
-- course_assignments, not a replacement: assigning a path creates ordinary
-- course_assignments rows (tagged with path_assignment_id), so the player,
-- playback / heartbeat checks, quizzes and certificates need no changes.
--
-- Course completion = a confirmed training_records row for that course (the
-- quiz submit route writes it), so a course passed before the path was
-- assigned counts automatically.
--
-- The assign / unassign / edit operations are SQL functions so each one is
-- atomic: a failure can never leave someone with a path but only some of its
-- courses. They are callable by the service role only (the API routes).
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

create table public.learning_paths (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name         text not null,
  description  text,
  sequential   boolean not null default true,   -- must courses be done in order?
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz                      -- hidden from builders / assign dialogs; existing assignments keep working
);

create table public.learning_path_courses (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  path_id      uuid not null references public.learning_paths(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  order_index  integer not null,
  constraint learning_path_courses_course_unique unique (path_id, course_id)
);

-- Removed courses are deleted (nothing to keep), so a plain unique index
-- covers "live" rows. The sync function reorders in two phases to avoid
-- collisions part-way through.
create unique index learning_path_courses_order_unique
  on public.learning_path_courses (path_id, order_index);

create table public.learning_path_assignments (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  path_id      uuid not null references public.learning_paths(id) on delete cascade,
  staff_id     uuid not null references public.staff(id) on delete cascade,
  assigned_by  uuid references auth.users(id) on delete set null,
  assigned_at  timestamptz not null default now(),
  due_date     date,                            -- stored only in v1
  completed_at timestamptz,
  constraint learning_path_assignments_unique unique (path_id, staff_id)
);

-- Which path (if any) created a course assignment. Null = assigned directly.
alter table public.course_assignments
  add column if not exists path_assignment_id uuid
    references public.learning_path_assignments(id) on delete set null;

create index on public.learning_paths (company_id);
create index on public.learning_path_courses (company_id);
create index on public.learning_path_courses (course_id);
create index on public.learning_path_assignments (company_id);
create index on public.learning_path_assignments (staff_id);
create index on public.course_assignments (path_assignment_id);

-- ── Only streamed courses, from the same company, in a path ──

create or replace function public.learning_path_courses_guard()
returns trigger language plpgsql as $$
declare
  v_type    text;
  v_company uuid;
begin
  select course_type, company_id into v_type, v_company
  from public.courses where id = new.course_id;

  if v_type is distinct from 'streamed' then
    raise exception 'Only self-paced (streamed) courses can be added to a learning path.';
  end if;
  if v_company is distinct from new.company_id then
    raise exception 'That course belongs to a different organization.';
  end if;
  return new;
end;
$$;

create trigger learning_path_courses_guard
  before insert or update of course_id on public.learning_path_courses
  for each row execute function public.learning_path_courses_guard();

-- ── RLS (same patterns as 015) ──────────────────────────────

alter table public.learning_paths            enable row level security;
alter table public.learning_path_courses     enable row level security;
alter table public.learning_path_assignments enable row level security;

-- Everyone in the company can read paths and their course lists (learners need
-- the names and order to render their path cards).
create policy "Tenant isolation – learning_paths select"
  on public.learning_paths for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – learning_paths insert (staff tier)"
  on public.learning_paths for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – learning_paths update (staff tier)"
  on public.learning_paths for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – learning_paths delete (admin role)"
  on public.learning_paths for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

create policy "Tenant isolation – learning_path_courses select"
  on public.learning_path_courses for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – learning_path_courses insert (staff tier)"
  on public.learning_path_courses for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – learning_path_courses update (staff tier)"
  on public.learning_path_courses for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – learning_path_courses delete (admin role)"
  on public.learning_path_courses for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

-- Learners read their own assignments; staff tier reads the company's.
create policy "learning_path_assignments select (self or staff tier)"
  on public.learning_path_assignments for select
  using (
    staff_id = public.jwt_staff_id()
    or (
      company_id = public.jwt_company_id()
      and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
    )
  );

create policy "learning_path_assignments insert (staff tier)"
  on public.learning_path_assignments for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "learning_path_assignments update (staff tier)"
  on public.learning_path_assignments for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "learning_path_assignments delete (admin role)"
  on public.learning_path_assignments for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

-- ── Completion ──────────────────────────────────────────────

-- Marks every unfinished path assignment for this person whose courses are
-- all confirmed. Cheap enough to call after any quiz pass or path edit.
create or replace function public.complete_learning_paths(p_staff_id uuid)
returns void language sql as $$
  update public.learning_path_assignments lpa
     set completed_at = now()
   where lpa.staff_id = p_staff_id
     and lpa.completed_at is null
     and exists (select 1 from public.learning_path_courses pc where pc.path_id = lpa.path_id)
     and not exists (
       select 1 from public.learning_path_courses pc
       where pc.path_id = lpa.path_id
         and not exists (
           select 1 from public.training_records tr
           where tr.staff_id = lpa.staff_id and tr.course_id = pc.course_id and tr.confirmed
         )
     );
$$;

-- ── Assign ──────────────────────────────────────────────────

-- All-or-nothing per person (each loop pass is its own subtransaction).
-- Re-assigning someone who already has the path does nothing.
create or replace function public.assign_learning_path(
  p_path_id     uuid,
  p_staff_ids   uuid[],
  p_assigned_by uuid
)
-- Output columns are prefixed so they can't clash with column names in ON CONFLICT targets.
returns table (out_staff_id uuid, out_assigned boolean, out_message text)
language plpgsql as $$
declare
  v_company uuid;
  s         uuid;
  v_pa      uuid;
begin
  select company_id into v_company
  from public.learning_paths where id = p_path_id and archived_at is null;
  if v_company is null then
    raise exception 'Learning path not found, or it has been archived.';
  end if;
  if not exists (select 1 from public.learning_path_courses where path_id = p_path_id) then
    raise exception 'Add at least one course to this path before assigning it.';
  end if;

  foreach s in array p_staff_ids loop
    begin
      if not exists (
        select 1 from public.staff st where st.id = s and st.company_id = v_company
      ) then
        raise exception 'Staff member not found in this organization.';
      end if;

      v_pa := null;
      insert into public.learning_path_assignments (company_id, path_id, staff_id, assigned_by)
      values (v_company, p_path_id, s, p_assigned_by)
      on conflict (path_id, staff_id) do nothing
      returning id into v_pa;

      if v_pa is null then
        out_staff_id := s; out_assigned := false; out_message := 'Already assigned'; return next;
        continue;
      end if;

      -- Existing individual or other-path assignments are left exactly as they are.
      insert into public.course_assignments (company_id, course_id, staff_id, assigned_by, path_assignment_id)
      select v_company, pc.course_id, s, p_assigned_by, v_pa
      from public.learning_path_courses pc
      where pc.path_id = p_path_id
      on conflict (course_id, staff_id) do nothing;

      -- Same as assigning a course by hand: a pending record so it shows as
      -- scheduled on the person's profile, unless they already have one.
      insert into public.training_records (company_id, staff_id, course_id, completed_date, confirmed)
      select v_company, s, pc.course_id, current_date, false
      from public.learning_path_courses pc
      where pc.path_id = p_path_id
        and not exists (
          select 1 from public.training_records tr
          where tr.staff_id = s and tr.course_id = pc.course_id
        );

      perform public.complete_learning_paths(s);

      out_staff_id := s; out_assigned := true; out_message := null; return next;
    exception when others then
      out_staff_id := s; out_assigned := false; out_message := sqlerrm; return next;
    end;
  end loop;
end;
$$;

-- ── Release one path-created course assignment ─────────────
-- Used by unassign and by removing a course from a path. Never touches
-- progress, attempts or confirmed training records:
--   • another path the person has also covers the course → hand it over
--   • the person has started it → keep it, just detach it from the path
--   • otherwise → delete the assignment and its pending (unconfirmed) record

create or replace function public.release_path_course_assignment(
  p_course_assignment_id uuid,
  p_path_assignment_id   uuid
)
returns void language plpgsql as $$
declare
  v_course uuid;
  v_staff  uuid;
  v_other  uuid;
begin
  select course_id, staff_id into v_course, v_staff
  from public.course_assignments
  where id = p_course_assignment_id and path_assignment_id = p_path_assignment_id;
  if v_course is null then return; end if;

  select lpa.id into v_other
  from public.learning_path_assignments lpa
  join public.learning_path_courses lpc on lpc.path_id = lpa.path_id
  where lpa.staff_id = v_staff
    and lpa.id <> p_path_assignment_id
    and lpc.course_id = v_course
  limit 1;

  if v_other is not null then
    update public.course_assignments set path_assignment_id = v_other where id = p_course_assignment_id;
  elsif exists (
    select 1 from public.course_watch_progress w where w.staff_id = v_staff and w.course_id = v_course
  ) then
    update public.course_assignments set path_assignment_id = null where id = p_course_assignment_id;
  else
    delete from public.course_assignments where id = p_course_assignment_id;
    delete from public.training_records
      where staff_id = v_staff and course_id = v_course and confirmed = false;
  end if;
end;
$$;

-- ── Unassign ────────────────────────────────────────────────

create or replace function public.unassign_learning_path(p_path_id uuid, p_staff_id uuid)
returns void language plpgsql as $$
declare
  v_pa uuid;
  r    record;
begin
  select id into v_pa from public.learning_path_assignments
  where path_id = p_path_id and staff_id = p_staff_id;
  if v_pa is null then return; end if;

  for r in select id from public.course_assignments where path_assignment_id = v_pa loop
    perform public.release_path_course_assignment(r.id, v_pa);
  end loop;

  delete from public.learning_path_assignments where id = v_pa;
end;
$$;

-- ── Edit a path's course list ───────────────────────────────

-- p_course_ids is the full, ordered list the path should end up with.
--   • removed courses: release them for every assignee (see above), then drop
--   • new courses: assign to every assignee who hasn't completed the path
--   • order: just takes effect
create or replace function public.sync_learning_path_courses(p_path_id uuid, p_course_ids uuid[])
returns void language plpgsql as $$
declare
  v_company uuid;
  v_course  uuid;
  r         record;
  i         int;
begin
  select company_id into v_company from public.learning_paths where id = p_path_id;
  if v_company is null then
    raise exception 'Learning path not found.';
  end if;
  if (select count(distinct c) from unnest(p_course_ids) c) <> coalesce(array_length(p_course_ids, 1), 0) then
    raise exception 'A course can only appear once in a path.';
  end if;

  -- Removals
  for v_course in
    select course_id from public.learning_path_courses
    where path_id = p_path_id and course_id <> all (p_course_ids)
  loop
    for r in
      select ca.id as ca_id, lpa.id as pa_id
      from public.learning_path_assignments lpa
      join public.course_assignments ca
        on ca.path_assignment_id = lpa.id and ca.course_id = v_course
      where lpa.path_id = p_path_id
    loop
      perform public.release_path_course_assignment(r.ca_id, r.pa_id);
    end loop;
    delete from public.learning_path_courses where path_id = p_path_id and course_id = v_course;
  end loop;

  -- Park survivors out of the way, then place everything in its final spot.
  update public.learning_path_courses set order_index = order_index + 100000 where path_id = p_path_id;

  for i in 1 .. coalesce(array_length(p_course_ids, 1), 0) loop
    update public.learning_path_courses
       set order_index = i - 1
     where path_id = p_path_id and course_id = p_course_ids[i];

    if not found then
      insert into public.learning_path_courses (company_id, path_id, course_id, order_index)
      values (v_company, p_path_id, p_course_ids[i], i - 1);

      insert into public.course_assignments (company_id, course_id, staff_id, assigned_by, path_assignment_id)
      select v_company, p_course_ids[i], lpa.staff_id, null, lpa.id
      from public.learning_path_assignments lpa
      where lpa.path_id = p_path_id and lpa.completed_at is null
      on conflict (course_id, staff_id) do nothing;

      insert into public.training_records (company_id, staff_id, course_id, completed_date, confirmed)
      select v_company, lpa.staff_id, p_course_ids[i], current_date, false
      from public.learning_path_assignments lpa
      where lpa.path_id = p_path_id and lpa.completed_at is null
        and not exists (
          select 1 from public.training_records tr
          where tr.staff_id = lpa.staff_id and tr.course_id = p_course_ids[i]
        );
    end if;
  end loop;

  -- Removing a course can finish the path for someone.
  for r in select staff_id from public.learning_path_assignments where path_id = p_path_id and completed_at is null loop
    perform public.complete_learning_paths(r.staff_id);
  end loop;
end;
$$;

-- Only the API routes (service role) call these.
revoke all on function public.complete_learning_paths(uuid)                         from public, anon, authenticated;
revoke all on function public.assign_learning_path(uuid, uuid[], uuid)              from public, anon, authenticated;
revoke all on function public.release_path_course_assignment(uuid, uuid)            from public, anon, authenticated;
revoke all on function public.unassign_learning_path(uuid, uuid)                    from public, anon, authenticated;
revoke all on function public.sync_learning_path_courses(uuid, uuid[])              from public, anon, authenticated;
grant execute on function public.complete_learning_paths(uuid)                      to service_role;
grant execute on function public.assign_learning_path(uuid, uuid[], uuid)           to service_role;
grant execute on function public.release_path_course_assignment(uuid, uuid)         to service_role;
grant execute on function public.unassign_learning_path(uuid, uuid)                 to service_role;
grant execute on function public.sync_learning_path_courses(uuid, uuid[])           to service_role;
