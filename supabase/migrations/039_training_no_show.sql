-- Attendance has three states for a registered person:
--   pending   confirmed = false, no_show = false  (not yet decided)
--   confirmed confirmed = true,  no_show = false  (attended, credit earned)
--   no-show   confirmed = false, no_show = true   (registered but did not attend)
-- A separate flag keeps every existing `confirmed` query working unchanged.
alter table public.training_records
  add column if not exists no_show boolean not null default false;

alter table public.training_records
  drop constraint if exists training_records_no_show_not_confirmed;
alter table public.training_records
  add constraint training_records_no_show_not_confirmed check (not (confirmed and no_show));
