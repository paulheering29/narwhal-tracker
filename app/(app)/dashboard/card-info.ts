// Fallback explanations for the (i) tooltips. The live text comes from the
// `dashboard_card_info` table (edit it in Supabase); these show only if a row
// is missing or the table can't be read.
export const CARD_INFO_DEFAULTS: Record<string, string> = {
  lapsed: 'Active staff whose certification or state license has expired with nothing covering today. A renewal that starts the day after (or the same day) means they are not lapsed.',
  pace_rbt: 'Share of active RBTs with a current certification cycle whose confirmed units (including approved outside trainings) are at or ahead of the straight-line pace for today.',
  pace_bcba: 'Share of active BCBAs with a current certification cycle whose confirmed units (including approved outside trainings) are at or ahead of the straight-line pace for today.',
  expiring_soon: 'Certifications and state licenses ending within the number of days you pick with the slider (up to 90). Bars show progress toward each person\'s renewal requirements. Click a name to open their profile.',
  calendar: 'Scheduled live trainings by month. A green dot marks a day with a training. Click the day to see the trainings, then click one to open it.',
  unconfirmed: 'Past live trainings where at least one registered person is still pending: not yet confirmed as attended and not marked a no-show. Open the training to settle them.',
  staff: 'Active certified staff, split by RBT and BCBA. Staff without a certification (such as non-certified trainers) are not counted.',
  course_rating: 'Average star rating (1-5) learners gave recorded courses, across all courses. Use the toggle for the last 30 days or all time.',
  modality_rbt: 'Trainings completed by active RBTs, split into internal live, internal recorded, and outside (external) trainings. Use the toggle for the last 30 days or all time.',
  modality_bcba: 'Trainings completed by active BCBAs, split into internal live, internal recorded, and outside (external) trainings. Use the toggle for the last 30 days or all time.',
}
