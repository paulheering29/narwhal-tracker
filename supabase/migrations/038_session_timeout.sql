-- Idle timeout: how many minutes of inactivity before someone is signed out.
-- Account Owner picks one of 15 / 30 / 60 / 120; 15 is the default.

alter table public.companies
  add column if not exists session_timeout_minutes integer not null default 15
  check (session_timeout_minutes in (15, 30, 60, 120));
