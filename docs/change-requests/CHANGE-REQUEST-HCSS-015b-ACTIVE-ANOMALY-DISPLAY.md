# Change Request: HCSS-015b — Recent Activity: Show Total Active Anomalies

**Project:** SNC Equipment Tracking
**Date:** 2026-04-10
**Status:** READY FOR IMPLEMENTATION
**Repo:** snc-dashboard
**Depends on:** HCSS-015 (total_active in SyncLog details)

---

## Problem

The Recent Activity reconciliation entry currently shows net-new insertions (e.g., "3 no HJ record") when it should show total currently-active anomalies (e.g., "20 no HJ record · 4 disputed · 1 unregistered").

---

## Fix

Update the `formatSyncLogEntry` function to use `details.total_active` fields instead of `details.anomaly_no_hj` (which was net-new):

```typescript
if (log.providerKey === 'reconciliation' && log.details) {
  const { anomaly_no_hj, disputed, not_in_either, total_active, new_anomalies, resolved } = log.details;
  
  const parts = [];
  if (anomaly_no_hj > 0) parts.push(`${anomaly_no_hj} no HJ record`);
  if (disputed > 0) parts.push(`${disputed} disputed`);
  if (not_in_either > 0) parts.push(`${not_in_either} unregistered`);
  
  const summary = parts.length > 0 ? parts.join(' · ') : 'no anomalies';
  const changeNote = new_anomalies > 0 || resolved > 0 
    ? ` (+${new_anomalies} new, ${resolved} resolved)`
    : '';
  
  return `Reconciliation — ${summary}${changeNote}`;
}
```

**Example outputs:**
- `Reconciliation — 20 no HJ record · 4 disputed · 1 unregistered` (steady state, no changes)
- `Reconciliation — 23 no HJ record · 4 disputed · 1 unregistered (+3 new, 0 resolved)` (when new anomalies detected)
- `Reconciliation — 18 no HJ record · 2 disputed (+0 new, 3 resolved)` (when anomalies clear up)

---

## Files to Modify

| File | Change |
|------|--------|
| Recent Activity component (Overview.tsx or similar) | Update formatSyncLogEntry for reconciliation entries |

---

## Verification

Trigger reconciliation manually. Recent Activity should show total active counts with optional change note. The numbers should match `SELECT COUNT(*) FROM "Anomaly" WHERE "resolvedAt" IS NULL GROUP BY "anomalyType"`.

Commit: "feat: HCSS-015b — show total active anomalies in Recent Activity"
Push to GitHub.
When completely finished, run: openclaw system event --text "Done: HCSS-015b active anomaly display implemented" --mode now
