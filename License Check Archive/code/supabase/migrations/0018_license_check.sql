-- License Check: CentralReach's staff download and a state's license download,
-- lined up by name, to see whose license is current, expiring or missing.
--
-- Nothing is stored here -- both files are read on the person's own computer and
-- never sent anywhere. This migration only teaches the database the module
-- exists, so an organization can be given it and a person's access to it can be
-- granted or withheld the same way as every other module.

alter table public.organization_modules
  drop constraint if exists organization_modules_module_id_check;

alter table public.organization_modules
  add constraint organization_modules_module_id_check
  check (module_id in ('system-review', 'true-utilization', 'accrued-review', 'ar-snapshot', 'map-view', 'meta-data-viewer', 'turnover-report', 'client-supervision', 'documented-during-session', 'license-check'));

alter table public.memberships
  drop constraint if exists memberships_modules_known;

alter table public.memberships
  add constraint memberships_modules_known
  check (modules <@ array['system-review', 'true-utilization', 'accrued-review', 'ar-snapshot', 'map-view', 'meta-data-viewer', 'turnover-report', 'client-supervision', 'documented-during-session', 'license-check']::text[]);

-- module_admins carries its own list of known modules (see 0016).
alter table public.memberships
  drop constraint if exists memberships_module_admins_known;

alter table public.memberships
  add constraint memberships_module_admins_known
  check (module_admins <@ array['system-review', 'true-utilization', 'accrued-review', 'ar-snapshot', 'map-view', 'meta-data-viewer', 'turnover-report', 'client-supervision', 'documented-during-session', 'license-check']::text[]);

-- A new person starts with every module there is, narrowed from there -- see
-- 0009. Everyone already here gets it on the same terms: it opens nothing
-- until the organization subscribes to it.
alter table public.memberships
  alter column modules
  set default array['system-review', 'true-utilization', 'accrued-review', 'ar-snapshot', 'map-view', 'meta-data-viewer', 'turnover-report', 'client-supervision', 'documented-during-session', 'license-check']::text[];

update public.memberships
   set modules = array_append(modules, 'license-check')
 where not ('license-check' = any (modules));
