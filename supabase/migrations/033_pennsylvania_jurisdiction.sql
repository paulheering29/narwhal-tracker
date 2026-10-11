-- Pennsylvania licenses behavior analysts as "Behavior Specialists" (State Board of
-- Medicine) and was not in the original 028 seed. Added so its license list can be
-- downloaded and so licenses can be entered for it. The CE rules have not been
-- researched, so they are left unset and flagged for verification.
insert into public.license_jurisdictions
  (code, name, regulation_status, cycle_years, ce_basis, needs_verification, ce_summary, renewal_notes, sources)
values
  ('PA', 'Pennsylvania', 'licensed', null, 'pending', true,
   'Not yet set - confirm CE requirements with the State Board of Medicine',
   'Licensed as a Behavior Specialist by the State Board of Medicine. The state''s public list shows a status but no expiration date.',
   'PA Department of State PALS license search')
on conflict (code) do nothing;
