/** "2027-12-31" -> "12/31/2027". Anything else comes back as it was. */
export function formatIsoDate(iso) {
  const match = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[2])}/${Number(match[3])}/${match[1]}` : String(iso ?? '');
}

/** "in 90 days", "today", "12 days ago". */
export function describeDays(days) {
  if (days === null || days === undefined) return '';
  if (days === 0) return 'today';
  const n = Math.abs(days).toLocaleString();
  const unit = Math.abs(days) === 1 ? 'day' : 'days';
  return days > 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`;
}
