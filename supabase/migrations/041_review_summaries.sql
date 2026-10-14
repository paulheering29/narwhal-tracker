-- ============================================================
-- Migration 041 – AI summaries of course reviews (one per course)
-- ============================================================
-- Written only by the server (service role) after the Reviews page asks for a
-- refresh. review_count + latest_review_at record what the summary covered so
-- the page can tell when new or edited reviews make it stale.
-- ============================================================

create table public.review_summaries (
  course_id        uuid primary key references public.courses(id) on delete cascade,
  company_id       uuid not null references public.companies(id) on delete cascade,
  summary          text not null,
  review_count     integer not null,
  latest_review_at timestamptz not null,
  generated_at     timestamptz not null default now()
);

alter table public.review_summaries enable row level security;

create policy "review_summaries select (staff tier)"
  on public.review_summaries for select
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
  );

create index on public.review_summaries (company_id);
