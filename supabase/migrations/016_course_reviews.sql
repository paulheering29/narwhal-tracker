-- ============================================================
-- Migration 016 – Course reviews (star rating + optional comment)
-- ============================================================
-- One review per staff member per course, upsertable (resubmitting
-- replaces their prior rating/comment rather than stacking up new rows —
-- this is "your review of the course," not an attempt log like quizzes).
-- ============================================================

create table public.course_reviews (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  staff_id     uuid not null references public.staff(id) on delete cascade,
  rating       integer not null check (rating between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint course_reviews_unique unique (course_id, staff_id)
);

alter table public.course_reviews enable row level security;

-- Self can read their own review (to prefill the form); any staff-tier
-- user can read every review in the company (for the admin summary view).
create policy "course_reviews select (self or staff tier)"
  on public.course_reviews for select
  using (
    staff_id = public.jwt_staff_id()
    or (
      company_id = public.jwt_company_id()
      and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
    )
  );

create policy "course_reviews insert (self)"
  on public.course_reviews for insert
  with check (
    company_id = public.jwt_company_id()
    and staff_id = public.jwt_staff_id()
  );

create policy "course_reviews update (self)"
  on public.course_reviews for update
  using (staff_id = public.jwt_staff_id())
  with check (staff_id = public.jwt_staff_id());

create policy "Tenant isolation – course_reviews delete (admin role)"
  on public.course_reviews for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') @> '["Admin"]'::jsonb
  );

create index on public.course_reviews (company_id);
create index on public.course_reviews (course_id);
create index on public.course_reviews (staff_id);
