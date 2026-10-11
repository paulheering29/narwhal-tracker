-- ============================================================
-- Migration 030 – State licensure, phase 3: reminders and automatic topic credit
-- ============================================================
-- companies.license_reminders_enabled   Account Owner can turn renewal emails off
-- license_reminders_sent                which reminder (90 / 60 / 30 days) went out
--                                       for which expiration, so nothing repeats and
--                                       a renewal (new expiration date) starts fresh.
--                                       Written by the daily cron job (service role).
-- course_license_topics                 "this course satisfies this state topic"
-- staff_license_topic_completions.training_record_id
--                                       set when a completion was credited
--                                       automatically from a confirmed training
--
-- When someone's confirmed training is for a course tagged with a state topic,
-- and they hold a license in that topic's state, the topic is marked done on that
-- license. That happens whichever way the training gets confirmed (quiz pass,
-- attendance), and also when a tag or a license is added later.
-- ============================================================

alter table public.companies
  add column if not exists license_reminders_enabled boolean not null default true;

create table public.license_reminders_sent (
  id               uuid primary key default uuid_generate_v4(),
  kind             text not null check (kind in ('license', 'bacb_cycle')),
  ref_id           uuid not null,                 -- staff_licenses.id or certification_cycles.id
  expiration_date  date not null,
  threshold        integer not null,              -- days before expiry: 90, 60, 30
  sent_at          timestamptz not null default now(),
  constraint license_reminders_sent_unique unique (kind, ref_id, expiration_date, threshold)
);

alter table public.license_reminders_sent enable row level security;   -- no policies: service role only

-- ── Course ↔ state topic tags ───────────────────────────────

create table public.course_license_topics (
  course_id   uuid not null references public.courses(id) on delete cascade,
  topic_id    uuid not null references public.license_requirement_topics(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (course_id, topic_id)
);

create index on public.course_license_topics (company_id);
create index on public.course_license_topics (topic_id);

alter table public.course_license_topics enable row level security;

create policy "course_license_topics select (company)"
  on public.course_license_topics for select
  using (company_id = public.jwt_company_id());

create policy "course_license_topics insert (admin / trainer / owner)"
  on public.course_license_topics for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['Admin','Trainer','Account Owner']
  );

create policy "course_license_topics delete (admin / trainer / owner)"
  on public.course_license_topics for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['Admin','Trainer','Account Owner']
  );

-- ── Automatic credit ────────────────────────────────────────

alter table public.staff_license_topic_completions
  add column if not exists training_record_id uuid references public.training_records(id) on delete cascade;

create unique index staff_license_topic_completions_credit_unique
  on public.staff_license_topic_completions (license_id, topic_id, training_record_id)
  where training_record_id is not null;

-- Idempotent: credits every confirmed training that should count and hasn't yet.
-- SECURITY DEFINER because it runs from triggers fired by anyone (a quiz pass, an
-- admin confirming attendance) and must be able to write completions regardless
-- of who that is.
create or replace function public.sync_license_topic_credits(p_staff_id uuid, p_course_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.staff_license_topic_completions
    (company_id, license_id, topic_id, completed_date, notes, training_record_id)
  select l.company_id, l.id, clt.topic_id, tr.completed_date,
         'Credited automatically from the course “' || c.name || '”', tr.id
  from public.training_records tr
  join public.courses c                      on c.id = tr.course_id
  join public.course_license_topics clt      on clt.course_id = tr.course_id
  join public.license_requirement_topics t   on t.id = clt.topic_id
  join public.staff_licenses l               on l.staff_id = tr.staff_id and l.jurisdiction_code = t.jurisdiction_code
  where tr.confirmed
    and (p_staff_id  is null or tr.staff_id  = p_staff_id)
    and (p_course_id is null or tr.course_id = p_course_id)
  on conflict (license_id, topic_id, training_record_id) where training_record_id is not null do nothing;
end;
$$;

revoke all on function public.sync_license_topic_credits(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sync_license_topic_credits(uuid, uuid) to service_role;

-- A training gets confirmed → credit it. Un-confirmed → take its credit back.
create or replace function public.trg_training_record_license_credit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.confirmed then
    perform public.sync_license_topic_credits(new.staff_id, new.course_id);
  elsif tg_op = 'UPDATE' then
    delete from public.staff_license_topic_completions where training_record_id = new.id;
  end if;
  return new;
end;
$$;

create trigger training_records_license_credit
  after insert or update of confirmed on public.training_records
  for each row execute function public.trg_training_record_license_credit();

-- A course gets tagged → credit people who already completed it.
create or replace function public.trg_course_topic_tag_added()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_license_topic_credits(null, new.course_id);
  return new;
end;
$$;

create trigger course_license_topics_added
  after insert on public.course_license_topics
  for each row execute function public.trg_course_topic_tag_added();

-- A tag is removed → take back what it credited.
create or replace function public.trg_course_topic_tag_removed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.staff_license_topic_completions
   where topic_id = old.topic_id
     and training_record_id in (select id from public.training_records where course_id = old.course_id);
  return old;
end;
$$;

create trigger course_license_topics_removed
  after delete on public.course_license_topics
  for each row execute function public.trg_course_topic_tag_removed();

-- A license gets added → credit trainings the person already completed.
create or replace function public.trg_license_added_credit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_license_topic_credits(new.staff_id, null);
  return new;
end;
$$;

create trigger staff_licenses_added_credit
  after insert on public.staff_licenses
  for each row execute function public.trg_license_added_credit();
