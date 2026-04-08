-- Migration 003 – Drop status column from certification_cycles.
-- Status is now derived from start_date / end_date compared to today.
alter table public.certification_cycles
  drop column if exists status;
