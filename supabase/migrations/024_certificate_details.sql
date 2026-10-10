-- ============================================================
-- Migration 024 – Everything printed on an outside training certificate
-- ============================================================
-- Fields from certificates such as the BACB "RBT Professional Development:
-- In-Service Event" form, filled by the certificate import (or by hand).
-- All optional. `provider` already holds the organization name and
-- `provider_number` its ACE / OP- number.
-- ============================================================

alter table public.external_trainings
  add column if not exists participant_cert_number  text,
  add column if not exists event_modality           text,
  add column if not exists trainer_name             text,
  add column if not exists trainer_cert_number      text,
  add column if not exists org_contact_name         text,
  add column if not exists org_contact_cert_number  text,
  add column if not exists signed                   boolean,
  add column if not exists signature_date           date;
