# Change Request: HCSS-016 — Fix Realtime SyncLog: Refetch Row on INSERT

**Project:** SNC Equipment Tracking
**Date:** 2026-04-10
**Status:** READY FOR IMPLEMENTATION
**Repo:** snc-dashboard

---

## Problem

When a new SyncLog row arrives via Realtime subscription, the `details` field is null or incomplete in the Realtime payload. The display shows "reconciliation: zero records" until the page is refreshed, at which point the full row is read correctly from the REST API.

Root cause: the Realtime INSERT event arrives before the Edge Function has finished writing all fields to the row, or the Realtime payload does not include all jsonb fields reliably.

---

## Fix

When a Realtime INSERT event fires for SyncLog, do not use the event payload directly. Instead, use it as a trigger to re-fetch the row by ID from the REST API.

```typescript
.on(
  'postgres_changes',
  { event: 'INSERT', schema: 'public', table: 'SyncLog' },
  async (payload) => {
    // Re-fetch the complete row instead of using payload.new directly
    const { data: fullRow } = await supabase
      .from('SyncLog')
      .select('*')
      .eq('id', payload.new.id)
      .single();

    if (!fullRow) return;

    const item = buildActivityItem(fullRow);
    setActivityItems(prev => [item, ...prev].slice(0, 50));
  }
)
```

---

## Files to Modify

| File | Change |
|------|--------|
| Recent Activity component (Overview.tsx or similar) | Re-fetch SyncLog row on Realtime INSERT instead of using payload directly |

---

## Verification

Trigger reconciliation from Supabase dashboard. Without refreshing, Recent Activity should immediately show the correct breakdown (e.g., "Reconciliation — 20 no HJ record · 4 disputed").

Commit: "fix: HCSS-016 — refetch SyncLog row on Realtime INSERT to fix stale details"
Push to GitHub.
When completely finished, run: openclaw system event --text "Done: HCSS-016 Realtime SyncLog refetch fix implemented" --mode now
