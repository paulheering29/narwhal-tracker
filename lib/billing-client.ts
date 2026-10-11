/** Tell the server the headcount changed so the subscription's per-person quantity follows. Fire and forget. */
export function syncBilling(): void {
  fetch('/api/billing/sync', { method: 'POST' }).catch(() => {})
}
