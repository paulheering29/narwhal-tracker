-- ============================================================
-- Migration 020 – Which credentials a training counts for, plus
--                 ethics / supervision units and requirements
-- ============================================================
-- courses.eligible_credentials  which credential_types this training earns
--                               units toward (RBT PDUs, BCBA CEUs, or both).
--                               Existing trainings were all RBT in-services.
-- courses.ethics_units          how many of `units` are ethics
-- courses.supervision_units     how many of `units` are supervision
-- staff.is_supervisor           only supervisors owe supervision units
-- credential_types.*_required   minimums per cycle (BCBA: 4 ethics,
--                               3 supervision), editable in the table editor
-- ============================================================

alter table public.courses
  add column if not exists eligible_credentials text[] not null default '{RBT}',
  add column if not exists ethics_units      numeric(5,2) not null default 0 check (ethics_units >= 0),
  add column if not exists supervision_units numeric(5,2) not null default 0 check (supervision_units >= 0);

alter table public.staff
  add column if not exists is_supervisor boolean not null default false;

alter table public.credential_types
  add column if not exists ethics_units_required      numeric(6,2) not null default 0,
  add column if not exists supervision_units_required numeric(6,2) not null default 0;

update public.credential_types
  set ethics_units_required = 4, supervision_units_required = 3
  where code = 'BCBA';
