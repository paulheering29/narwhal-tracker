-- ============================================================
-- Migration 019 – Credential types (RBT / BCBA)
-- ============================================================
-- staff.role is now the person's credential: 'RBT', 'BCBA', or 'Trainer'
-- (no credential). Trainer / Admin / Account Owner remain permissions in
-- staff.roles, so a BCBA who trains is role = 'BCBA' + roles @> {Trainer}.
--
-- credential_types holds what differs per credential — the unit name on
-- dashboards and certificates, and how many are needed per cycle — so a
-- new credential (e.g. BCaBA) or a changed requirement is a row edit in the
-- Supabase table editor, not a code change.
-- ============================================================

create table public.credential_types (
  code            text primary key,          -- matches staff.role / certification_cycles.certification_type
  unit_label      text not null,             -- 'PDU' or 'CEU' (singular; UI adds the s)
  units_required  numeric(6,2) not null,     -- per certification cycle
  sort_order      integer not null default 0
);

alter table public.credential_types enable row level security;

-- Reference data, identical for every company.
create policy "credential_types readable by signed-in users"
  on public.credential_types for select
  to authenticated
  using (true);

insert into public.credential_types (code, unit_label, units_required, sort_order) values
  ('RBT',  'PDU', 12, 1),
  ('BCBA', 'CEU', 32, 2);

-- Cycles now reference the table instead of a hard-coded check list, so a
-- new credential row is immediately usable for cycles too.
alter table public.certification_cycles
  drop constraint if exists certification_cycles_certification_type_check;

alter table public.certification_cycles
  add constraint certification_cycles_certification_type_fkey
  foreign key (certification_type) references public.credential_types(code);

-- Existing people: the two BCBAs, and 'Admin' job titles become 'Trainer'
-- since Admin is a permission (staff.roles), not a credential.
update public.staff set role = 'BCBA'
  where id in ('e476536c-1204-4c34-b858-70c6097ca05c',   -- Paulie Heering
               '77daf3a0-d33f-44c0-8cd6-d3a59862b8ed');  -- William Flood

update public.staff set role = 'Trainer' where role = 'Admin';
