-- Seed: a bunch of completed (confirmed) trainings in 2026 for one staff member.
-- Paste into the Supabase SQL editor. Safe to re-run: it first removes the
-- courses it created before (names start with "[Seed] "), which cascades to the
-- training_records.

do $$
declare
  v_staff_id   uuid := '29eb5bdf-059e-40d9-872f-f1a91038b150';
  v_company_id uuid;
  v_credential text;
  v_course_id  uuid;
  t            record;
begin
  select company_id, role into v_company_id, v_credential
  from public.staff where id = v_staff_id;

  if v_company_id is null then
    raise exception 'Staff % not found', v_staff_id;
  end if;

  delete from public.courses
  where company_id = v_company_id and name like '[Seed] %';

  for t in
    select * from (values
      -- name,                                    date,         units, ethics, supervision, modality,              trainer
      ('Ethics in Behavior Analysis',             '2026-01-14'::date, 2.0, 2.0, 0.0, 'online-synchronous',   'Dr. Maya Ortiz'),
      ('Introduction to Functional Analysis',     '2026-01-28'::date, 1.5, 0.0, 0.0, 'in-person',            'Sam Whitaker'),
      ('Data Collection Fundamentals',            '2026-02-11'::date, 1.0, 0.0, 0.0, 'online-asynchronous',  'Priya Nair'),
      ('Supervision Best Practices',              '2026-02-25'::date, 2.0, 0.0, 2.0, 'online-synchronous',   'Dr. Maya Ortiz'),
      ('Reinforcement Systems',                   '2026-03-10'::date, 1.5, 0.0, 0.0, 'in-person',            'Sam Whitaker'),
      ('Professional Boundaries & Dual Relationships', '2026-03-24'::date, 1.0, 1.0, 0.0, 'online-asynchronous', 'Priya Nair'),
      ('Behavior Intervention Plans',             '2026-04-08'::date, 2.5, 0.0, 0.0, 'in-person',            'Dr. Maya Ortiz'),
      ('Cultural Responsiveness in ABA',          '2026-04-22'::date, 1.5, 0.5, 0.0, 'online-synchronous',   'Jordan Lee'),
      ('Teaching Functional Communication',       '2026-05-06'::date, 2.0, 0.0, 0.0, 'in-person',            'Sam Whitaker'),
      ('Parent Training Strategies',              '2026-05-20'::date, 1.0, 0.0, 0.0, 'online-asynchronous',  'Jordan Lee'),
      ('Crisis Prevention & Safety',              '2026-06-03'::date, 2.0, 0.0, 0.0, 'in-person',            'Priya Nair'),
      ('Ethical Decision-Making Case Studies',    '2026-06-17'::date, 1.5, 1.5, 0.0, 'online-synchronous',   'Dr. Maya Ortiz'),
      ('Preference Assessments',                  '2026-07-08'::date, 1.0, 0.0, 0.0, 'online-asynchronous',  'Sam Whitaker'),
      ('Clinical Supervision Models',             '2026-07-22'::date, 2.0, 0.0, 1.5, 'online-synchronous',   'Jordan Lee'),
      ('Generalization & Maintenance',            '2026-08-05'::date, 1.5, 0.0, 0.0, 'in-person',            'Priya Nair'),
      ('Telehealth Service Delivery',             '2026-08-19'::date, 1.0, 0.0, 0.0, 'online-asynchronous',  'Sam Whitaker'),
      ('Ethics Code Updates',                     '2026-09-09'::date, 2.0, 2.0, 0.0, 'online-synchronous',   'Dr. Maya Ortiz'),
      ('Graphing & Visual Analysis',              '2026-09-23'::date, 1.5, 0.0, 0.0, 'in-person',            'Jordan Lee'),
      ('Documentation & Session Notes',           '2026-10-01'::date, 1.0, 0.0, 0.0, 'online-asynchronous',  'Priya Nair'),
      ('Self-Care and Burnout Prevention',        '2026-10-08'::date, 1.0, 0.0, 0.0, 'online-synchronous',   'Jordan Lee')
    ) as v(name, date, units, ethics_units, supervision_units, modality, trainer_name)
  loop
    insert into public.courses
      (company_id, name, date, start_time, end_time, units, ethics_units, supervision_units,
       modality, trainer_name, eligible_credentials, validity_months)
    values
      (v_company_id, '[Seed] ' || t.name, t.date, '09:00', '09:00'::time + (t.units || ' hours')::interval,
       t.units, t.ethics_units, t.supervision_units, t.modality, t.trainer_name,
       array[coalesce(v_credential, 'RBT')], null)
    returning id into v_course_id;

    -- confirmed = attendance verified, so the credit counts (and the license-topic
    -- trigger from migration 030 fires on insert).
    insert into public.training_records
      (company_id, staff_id, course_id, completed_date, confirmed)
    values
      (v_company_id, v_staff_id, v_course_id, t.date, true);
  end loop;
end $$;
