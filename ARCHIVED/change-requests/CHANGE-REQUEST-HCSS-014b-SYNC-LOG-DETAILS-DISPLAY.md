# Change Request: HCSS-014b — Recent Activity: Rich Sync Log Display

**Project:** SNC Equipment Tracking
**Date:** 2026-04-10
**Status:** READY FOR IMPLEMENTATION
**Repo:** snc-dashboard
**Depends on:** HCSS-014 (SyncLog details field)

---

## Summary

Update the Recent Activity panel to display the structured `details` field from `SyncLog`, showing meaningful operational summaries instead of raw record counts.

---

## Display Format

**E360 sync entry:**
> ✅ E360 sync complete — 610 machines (288 fresh GPS, 322 stale)

**Reconciliation entry:**
> ✅ Reconciliation complete — 18 no HJ record · 4 disputed · 1 unregistered

**Error entry (any provider):**
> ❌ E360 sync failed — [errorMessage]

---

## Implementation

In the Recent Activity component, update the display string formatter for SyncLog entries:

```typescript
function formatSyncLogEntry(log: SyncLog): string {
  if (log.status === 'error') {
    return `${log.providerName} failed — ${log.errorMessage}`;
  }

  if (log.providerKey === 'e360' && log.details) {
    const { total, fresh_gps, stale_gps } = log.details;
    return `E360 sync complete — ${total} machines (${fresh_gps} fresh GPS, ${stale_gps} stale)`;
  }

  if (log.providerKey === 'reconciliation' && log.details) {
    const { anomaly_no_hj, disputed, not_in_either } = log.details;
    const parts = [];
    if (anomaly_no_hj > 0) parts.push(`${anomaly_no_hj} no HJ record`);
    if (disputed > 0) parts.push(`${disputed} disputed`);
    if (not_in_either > 0) parts.push(`${not_in_either} unregistered`);
    const summary = parts.length > 0 ? parts.join(' · ') : 'no anomalies';
    return `Reconciliation complete — ${summary}`;
  }

  // Fallback for unknown providers
  return `${log.providerName} complete — ${log.rowsInserted} records`;
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| Recent Activity component | Update SyncLog entry formatter to use details field |

---

## Verification

After HCSS-014 is deployed and a sync run completes, Recent Activity should show the rich format. No deployment needed beyond the normal Vercel auto-deploy on push.

Commit: "feat: HCSS-014b — rich sync log display in Recent Activity"
Push to GitHub.
When completely finished, run: openclaw system event --text "Done: HCSS-014b rich sync log display implemented" --mode now
