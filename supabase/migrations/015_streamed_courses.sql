-- ============================================================
-- Migration 015 – Streamed courses (Bunny Stream video + quiz + auto-cert)
-- ============================================================
-- Adds a self-paced course type alongside existing live trainings:
--   courses.course_type   'live' (existing) | 'streamed' (new)
--   course_videos          ordered parts (Part 1, Part 2, ...) per course
--   course_assignments     who a streamed course has been assigned to
--   quizzes / quiz_questions           one quiz per course
--   quiz_attempts / quiz_attempt_answers   every try, not just the latest
--   course_watch_progress  server-verified watch coverage per video
--
-- A passed quiz attempt still just inserts a confirmed `training_records`
-- row — the existing certificate pipeline (lib/certificates/*) needs no
-- changes at all.
--
-- Also extends the JWT sync trigger to carry staff_id, so self-scoped
-- RLS (a user's own quiz attempts / watch progress) doesn't need a
-- subquery on every row check.
-- ============================================================

-- ─────────────────────────────────────────────
-- 0. JWT: add staff_id claim + helper function
-- ─────────────────────────────────────────────

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
        'roles',      to_jsonb(coalesce(new.roles, '{}'::text[])),
        'staff_id',   new.id
      )
  where id = new.auth_id;
  return new;
end;
$$;

create or replace function public.jwt_staff_id()
returns uuid language sql stable
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid;
$$;

-- Refresh app_metadata for everyone who already has a login so the new
-- staff_id claim is populated. Still requires sign-out/in to take effect
-- in an existing session's JWT, same as prior migrations that touched this.
update public.staff set auth_id = auth_id where auth_id is not null;

-- ─────────────────────────────────────────────
-- 1. courses.course_type
-- ─────────────────────────────────────────────

alter table public.courses
  add column if not exists course_type text not null default 'live'
    check (course_type in ('live', 'streamed'));

create index if not exists courses_company_type_idx
  on public.courses (company_id, course_type);

-- ─────────────────────────────────────────────
-- 2. course_videos  (Part 1, Part 2, ... per streamed course)
-- ─────────────────────────────────────────────

create table public.course_videos (
  id                uuid primary key default uuid_generate_v4(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  course_id         uuid not null references public.courses(id) on delete cascade,
  order_index       integer not null,
  title             text,
  bunny_video_id    text not null,
  bunny_library_id  text not null,
  duration_seconds  integer,
  created_at        timestamptz not null default now(),
  constraint course_videos_order_unique unique (course_id, order_index)
);

alter table public.course_videos enable row level security;

create policy "Tenant isolation – course_videos select"
  on public.course_videos for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – course_videos insert (staff tier)"
  on public.course_videos for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – course_videos update (staff tier)"
  on public.course_videos for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – course_videos delete (admin role)"
  on public.course_videos for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

create index on public.course_videos (company_id);
create index on public.course_videos (course_id);

-- ─────────────────────────────────────────────
-- 3. course_assignments  (who a streamed course was assigned to)
-- ─────────────────────────────────────────────

create table public.course_assignments (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  staff_id     uuid not null references public.staff(id) on delete cascade,
  assigned_by  uuid references auth.users(id) on delete set null,
  assigned_at  timestamptz not null default now(),
  constraint course_assignments_unique unique (course_id, staff_id)
);

alter table public.course_assignments enable row level security;

create policy "Tenant isolation – course_assignments select"
  on public.course_assignments for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – course_assignments insert (staff tier)"
  on public.course_assignments for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – course_assignments delete (admin role)"
  on public.course_assignments for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

create index on public.course_assignments (company_id);
create index on public.course_assignments (course_id);
create index on public.course_assignments (staff_id);

-- ─────────────────────────────────────────────
-- 4. quizzes  (one per streamed course)
-- ─────────────────────────────────────────────

create table public.quizzes (
  id               uuid primary key default uuid_generate_v4(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  course_id        uuid not null references public.courses(id) on delete cascade,
  pass_percentage  integer not null default 80 check (pass_percentage between 1 and 100),
  created_at       timestamptz not null default now(),
  constraint quizzes_course_unique unique (course_id)
);

alter table public.quizzes enable row level security;

create policy "Tenant isolation – quizzes select"
  on public.quizzes for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – quizzes insert (staff tier)"
  on public.quizzes for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – quizzes update (staff tier)"
  on public.quizzes for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – quizzes delete (admin role)"
  on public.quizzes for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

create index on public.quizzes (company_id);

-- ─────────────────────────────────────────────
-- 5. quiz_questions
-- ─────────────────────────────────────────────
-- `options` is a JSON array of option strings, e.g. ["A", "B", "C", "D"].
-- `correct_option_index` indexes into that array (0-based). Note: the
-- staff-facing quiz-taking flow should fetch questions through a server
-- API route (service role, correct_option_index stripped) rather than a
-- direct client query against this table, so the answer key never ships
-- to the browser before grading. RLS below still allows staff-tier read
-- for the admin quiz-authoring UI, which does need to see answers.

create table public.quiz_questions (
  id                     uuid primary key default uuid_generate_v4(),
  company_id             uuid not null references public.companies(id) on delete cascade,
  quiz_id                uuid not null references public.quizzes(id) on delete cascade,
  order_index            integer not null,
  question_text          text not null,
  options                jsonb not null,
  correct_option_index   integer not null,
  created_at             timestamptz not null default now(),
  constraint quiz_questions_order_unique unique (quiz_id, order_index)
);

alter table public.quiz_questions enable row level security;

create policy "Tenant isolation – quiz_questions select"
  on public.quiz_questions for select
  using (company_id = public.jwt_company_id());

create policy "Tenant isolation – quiz_questions insert (staff tier)"
  on public.quiz_questions for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – quiz_questions update (staff tier)"
  on public.quiz_questions for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create policy "Tenant isolation – quiz_questions delete (admin role)"
  on public.quiz_questions for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

create index on public.quiz_questions (company_id);
create index on public.quiz_questions (quiz_id);

-- ─────────────────────────────────────────────
-- 6. quiz_attempts  (every try is kept, flagged with attempt_number)
-- ─────────────────────────────────────────────

create table public.quiz_attempts (
  id               uuid primary key default uuid_generate_v4(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  staff_id         uuid not null references public.staff(id) on delete cascade,
  quiz_id          uuid not null references public.quizzes(id) on delete cascade,
  course_id        uuid not null references public.courses(id) on delete cascade,
  attempt_number   integer not null,
  score_percentage numeric(5,2) not null,
  passed           boolean not null,
  submitted_at     timestamptz not null default now(),
  constraint quiz_attempts_attempt_unique unique (quiz_id, staff_id, attempt_number)
);

alter table public.quiz_attempts enable row level security;

-- Self can see their own attempts; any staff-tier user can see every
-- attempt in the company (needed for the quiz-insights dashboard).
create policy "quiz_attempts select (self or staff tier)"
  on public.quiz_attempts for select
  using (
    staff_id = public.jwt_staff_id()
    or (
      company_id = public.jwt_company_id()
      and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
    )
  );

create policy "quiz_attempts insert (self)"
  on public.quiz_attempts for insert
  with check (
    company_id = public.jwt_company_id()
    and staff_id = public.jwt_staff_id()
  );

create policy "Tenant isolation – quiz_attempts delete (admin role)"
  on public.quiz_attempts for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

create index on public.quiz_attempts (company_id);
create index on public.quiz_attempts (quiz_id, staff_id);
create index on public.quiz_attempts (course_id);

-- ─────────────────────────────────────────────
-- 7. quiz_attempt_answers  (per-question answers, for question-level trends)
-- ─────────────────────────────────────────────

create table public.quiz_attempt_answers (
  id                     uuid primary key default uuid_generate_v4(),
  company_id             uuid not null references public.companies(id) on delete cascade,
  attempt_id             uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id            uuid not null references public.quiz_questions(id) on delete cascade,
  selected_option_index  integer not null,
  is_correct             boolean not null,
  constraint quiz_attempt_answers_unique unique (attempt_id, question_id)
);

alter table public.quiz_attempt_answers enable row level security;

create policy "quiz_attempt_answers select (self or staff tier)"
  on public.quiz_attempt_answers for select
  using (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = attempt_id
        and (
          a.staff_id = public.jwt_staff_id()
          or (
            a.company_id = public.jwt_company_id()
            and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
          )
        )
    )
  );

create policy "quiz_attempt_answers insert (self)"
  on public.quiz_attempt_answers for insert
  with check (
    company_id = public.jwt_company_id()
    and exists (
      select 1 from public.quiz_attempts a
      where a.id = attempt_id and a.staff_id = public.jwt_staff_id()
    )
  );

create index on public.quiz_attempt_answers (attempt_id);
create index on public.quiz_attempt_answers (question_id);

-- ─────────────────────────────────────────────
-- 8. course_watch_progress  (server-verified watch coverage, per video)
-- ─────────────────────────────────────────────

create table public.course_watch_progress (
  id                      uuid primary key default uuid_generate_v4(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  staff_id                uuid not null references public.staff(id) on delete cascade,
  course_id               uuid not null references public.courses(id) on delete cascade,
  course_video_id         uuid not null references public.course_videos(id) on delete cascade,
  furthest_second_reached numeric(10,2) not null default 0,
  total_seconds_watched   numeric(10,2) not null default 0,
  completed               boolean not null default false,
  updated_at              timestamptz not null default now(),
  constraint course_watch_progress_unique unique (staff_id, course_video_id)
);

alter table public.course_watch_progress enable row level security;

create policy "course_watch_progress select (self or staff tier)"
  on public.course_watch_progress for select
  using (
    staff_id = public.jwt_staff_id()
    or (
      company_id = public.jwt_company_id()
      and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
    )
  );

create policy "course_watch_progress insert (self)"
  on public.course_watch_progress for insert
  with check (
    company_id = public.jwt_company_id()
    and staff_id = public.jwt_staff_id()
  );

create policy "course_watch_progress update (self)"
  on public.course_watch_progress for update
  using (staff_id = public.jwt_staff_id())
  with check (staff_id = public.jwt_staff_id());

create index on public.course_watch_progress (company_id);
create index on public.course_watch_progress (staff_id, course_id);
create index on public.course_watch_progress (course_video_id);
