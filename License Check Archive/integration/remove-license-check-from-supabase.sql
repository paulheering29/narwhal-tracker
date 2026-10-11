-- OPTIONAL. Only needed if 0018_license_check.sql was ever run against a database.
-- Takes 'license-check' back out of what the database knows about, leaving the
-- module list as 0017 had it. Harmless to skip: the app ignores module ids it
-- does not know.

delete from public.organization_modules where module_id = 'license-check';

update public.memberships
   set modules = array_remove(modules, 'license-check'),
       module_admins = array_remove(module_admins, 'license-check')
 where 'license-check' = any (modules) or 'license-check' = any (module_admins);

alter table public.organization_modules drop constraint if exists organization_modules_module_id_check;
alter table public.organization_modules add constraint organization_modules_module_id_check
  check (module_id in ('system-review', 'true-utilization', 'accrued-review', 'ar-snapshot', 'map-view', 'meta-data-viewer', 'turnover-report', 'client-supervision', 'documented-during-session'));

alter table public.memberships drop constraint if exists memberships_modules_known;
alter table public.memberships add constraint memberships_modules_known
  check (modules <@ array['system-review', 'true-utilization', 'accrued-review', 'ar-snapshot', 'map-view', 'meta-data-viewer', 'turnover-report', 'client-supervision', 'documented-during-session']::text[]);

alter table public.memberships drop constraint if exists memberships_module_admins_known;
alter table public.memberships add constraint memberships_module_admins_known
  check (module_admins <@ array['system-review', 'true-utilization', 'accrued-review', 'ar-snapshot', 'map-view', 'meta-data-viewer', 'turnover-report', 'client-supervision', 'documented-during-session']::text[]);

alter table public.memberships alter column modules
  set default array['system-review', 'true-utilization', 'accrued-review', 'ar-snapshot', 'map-view', 'meta-data-viewer', 'turnover-report', 'client-supervision', 'documented-during-session']::text[];
