-- Migration 002 – Preferred/display names on staff
alter table public.staff
  add column if not exists display_first_name text,
  add column if not exists display_last_name  text;
