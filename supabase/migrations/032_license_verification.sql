-- ============================================================
-- Migration 032 – Nightly state license verification
-- ============================================================
-- state_license_records  a slim copy of each state's public license list
--                        (name, number, status, expiry). Refreshed nightly by
--                        /api/cron/license-verify. Shared by every company, so
--                        it is written only by the service role (RLS on, no
--                        policies: nobody signed in can read or change it).
-- state_license_sync     when each state was last downloaded, and why not if it failed.
-- staff_licenses         gets the result of the last check against that list.
-- ============================================================

create table public.state_license_records (
  jurisdiction_code  text not null references public.license_jurisdictions(code),
  license_number     text not null,
  license_type       text not null default '',
  status             text not null default '',
  first_name         text not null default '',
  middle_name        text not null default '',
  last_name          text not null default '',
  city               text,
  state              text,
  expires            date,
  refreshed_at       timestamptz not null default now(),
  primary key (jurisdiction_code, license_number, license_type)
);

create index on public.state_license_records (jurisdiction_code, lower(last_name));

alter table public.state_license_records enable row level security;

create table public.state_license_sync (
  jurisdiction_code  text primary key references public.license_jurisdictions(code),
  last_synced_at     timestamptz,           -- last successful download
  last_attempt_at    timestamptz,
  row_count          integer,
  source_date        date,                  -- when the state generated the file, if it says
  error              text                   -- null when the last attempt worked
);

alter table public.state_license_sync enable row level security;

create policy "state_license_sync readable by signed-in users"
  on public.state_license_sync for select to authenticated using (true);

alter table public.staff_licenses
  add column verified_at          timestamptz,   -- when the nightly check last ran for this license
  add column verification_result  text check (verification_result in ('verified','expired','not_found','review')),
  add column verification_detail  text,          -- plain-language reason, shown on hover
  add column state_status          text,          -- what the state calls it, as published
  add column state_expiration      date;          -- the expiry the state publishes, if any
