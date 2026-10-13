-- Editable (i) tooltip text for the trainer dashboard cards. Change the
-- explanation in the Supabase table editor; no code change or redeploy needed.
create table if not exists public.dashboard_card_info (
  card_key     text primary key,   -- fixed id the dashboard looks up; don't rename
  card_name    text not null,
  explanation  text not null,
  updated_at   timestamptz not null default now()
);

alter table public.dashboard_card_info enable row level security;

-- Everyone signed in can read; edits happen in the Supabase dashboard.
drop policy if exists "dashboard_card_info select" on public.dashboard_card_info;
create policy "dashboard_card_info select"
  on public.dashboard_card_info for select to authenticated using (true);

insert into public.dashboard_card_info (card_key, card_name, explanation) values
  ('lapsed', 'Lapsed', 'Active staff whose certification or state license has expired with nothing covering today. A renewal that starts the day after (or the same day) means they are not lapsed.'),
  ('pace_rbt', 'RBTs pace', 'Share of active RBTs with a current certification cycle whose confirmed units (including approved outside trainings) are at or ahead of the straight-line pace for today.'),
  ('pace_bcba', 'BCBAs pace', 'Share of active BCBAs with a current certification cycle whose confirmed units (including approved outside trainings) are at or ahead of the straight-line pace for today.'),
  ('expiring_soon', 'Expiring Soon', 'Certifications and state licenses ending within the number of days you pick with the slider (up to 90). Bars show progress toward each person''s renewal requirements. Click a name to open their profile.'),
  ('calendar', 'Calendar', 'Scheduled live trainings by month. A green dot marks a day with a training. Click the day to see the trainings, then click one to open it.'),
  ('unconfirmed', 'Unconfirmed', 'Past live trainings where at least one registered person is still pending: not yet confirmed as attended and not marked a no-show. Open the training to settle them.'),
  ('staff', 'Staff', 'Active certified staff, split by RBT and BCBA. Staff without a certification (such as non-certified trainers) are not counted.'),
  ('course_rating', 'Course Rating', 'Average star rating (1-5) learners gave recorded courses, across all courses. Use the toggle for the last 30 days or all time.'),
  ('modality_rbt', 'Training Modality (RBTs)', 'Trainings completed by active RBTs, split into internal live, internal recorded, and outside (external) trainings. Use the toggle for the last 30 days or all time.'),
  ('modality_bcba', 'Training Modality (BCBAs)', 'Trainings completed by active BCBAs, split into internal live, internal recorded, and outside (external) trainings. Use the toggle for the last 30 days or all time.')
on conflict (card_key) do nothing;
