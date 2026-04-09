-- Migration 010: Move certification_number to staff, add original_certification_date
--
-- RBT cert numbers never change (they're issued once by BACB), so they belong
-- on the staff record, not on each cycle.  original_certification_date is the
-- date the RBT was first certified — also a one-time fact about the person.

-- ── 1. Add new columns to staff ──────────────────────────────────────────────

alter table public.staff
  add column if not exists certification_number       text,
  add column if not exists original_certification_date date;

-- ── 2. Copy existing cert numbers from each staff member's most recent cycle ─

update public.staff s
set certification_number = sub.certification_number
from (
  select distinct on (staff_id)
    staff_id,
    certification_number
  from public.certification_cycles
  where certification_number is not null
    and certification_number <> ''
  order by staff_id, start_date desc
) sub
where s.id = sub.staff_id
  and s.certification_number is null;

-- ── 3. Make certification_number nullable on cycles (it's now on staff) ──────

alter table public.certification_cycles
  alter column certification_number drop not null;
