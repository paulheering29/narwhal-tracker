-- ============================================================
-- Migration 006 – Add confirmed field to training_records
-- ============================================================
-- confirmed = false → staff member is scheduled / expected
-- confirmed = true  → attendance verified, PDU credit earned
-- ============================================================

alter table public.training_records
  add column if not exists confirmed boolean not null default false;

create index if not exists training_records_confirmed_idx
  on public.training_records (company_id, confirmed);
