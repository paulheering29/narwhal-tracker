-- Optional nightly email with the results of the state license check.
-- Off by default. The Account Owner turns it on for the company and ticks which
-- people in Training Loop (staff records) receive it.

alter table public.companies
  add column if not exists license_check_email_enabled boolean not null default false;

alter table public.staff
  add column if not exists license_check_email boolean not null default false;
