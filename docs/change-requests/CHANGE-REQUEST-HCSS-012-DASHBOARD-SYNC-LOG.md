# Change Request: HCSS-012 — Dashboard: Equipment Coverage Stats + Sync Log in Recent Activity

**Project:** SNC Equipment Tracking
**Date:** 2026-04-10
**Status:** READY FOR IMPLEMENTATION
**Repo:** snc-dashboard
**Depends on:** HCSS-011 (SyncLog table + Edge Function logging)

---

## Summary

Two dashboard improvements:

1. **Equipment coverage breakdown** on the Overview page — replace the single "753 total" stat with a breakdown showing tracked (telematics-enabled) vs. untracked (attachments, non-powered) equipment
2. **Sync log in Recent Activity** — add `SyncLog` entries to the Recent Activity panel via Supabase Realtime so operators can see when syncs ran, how many records were processed, and whether any errors occurred

---

## Change 1: Equipment Coverage Stats

### Current behavior
Overview shows a single stat: "753 Equipment"

### New behavior
Show a stat card row with three values:
- **610 Tracked** — equipment with telematics (GPS + engine data flowing)
- **143 Untracked** — attachments and non-powered equipment (no telematics device)
- **753 Total** — all equipment in E360

These numbers are derived by comparing the `Equipment` table count against the count of distinct `equipmentCode` values that appear in `TelematicsSnapshot` (from the most recent snapshot batch).

### Implementation

Query at page load (not Realtime — this doesn't change frequently):

```typescript
// Total equipment
const { count: totalEquipment } = await supabase
  .from('Equipment')
  .select('*', { count: 'exact', head: true });

// Get most recent snapshotAt timestamp
const { data: latestSnap } = await supabase
  .from('TelematicsSnapshot')
  .select('snapshotAt')
  .order('snapshotAt', { ascending: false })
  .limit(1)
  .single();

// Count distinct equipment codes in that snapshot
const { count: trackedEquipment } = await supabase
  .from('TelematicsSnapshot')
  .select('equipmentCode', { count: 'exact', head: true })
  .eq('snapshotAt', latestSnap.snapshotAt);

const untrackedEquipment = totalEquipment - trackedEquipment;
```

Display as a horizontal stat row near the top of the Overview page, above the map. Style consistent with existing stat cards.

---

## Change 2: Sync Log in Recent Activity

### Current behavior
Recent Activity panel shows dispatch events and other Realtime changes.

### New behavior
Include `SyncLog` entries in the Recent Activity panel. Each sync run appears as an activity item:

- ✅ **E360 sync complete** — 610 records, 4.2s (shown for status = "success")
- ❌ **E360 sync failed** — Connection timeout (shown for status = "error")

Sync log entries should be visually distinct from dispatch events — use a different icon (e.g., a refresh/sync icon) and a muted color for success entries, red for errors.

### Implementation

Add `SyncLog` to the existing Realtime subscription in the Recent Activity component:

```typescript
const syncLogSubscription = supabase
  .channel('sync-log-changes')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'SyncLog' },
    (payload) => {
      const log = payload.new;
      const item: ActivityItem = {
        id: log.id,
        type: 'sync',
        providerKey: log.providerKey,
        providerName: log.providerName,
        status: log.status,
        rowsInserted: log.rowsInserted,
        durationMs: log.durationMs,
        errorMessage: log.errorMessage,
        timestamp: log.completedAt,
      };
      setActivityItems(prev => [item, ...prev].slice(0, 50));
    }
  )
  .subscribe();
```

Also load the last 10 `SyncLog` entries on initial page load to populate history before Realtime kicks in:

```typescript
const { data: recentSyncs } = await supabase
  .from('SyncLog')
  .select('*')
  .order('completedAt', { ascending: false })
  .limit(10);
```

---

## Files to Modify

| File | Change |
|------|--------|
| Overview page component | Add equipment coverage stat row; query Equipment + TelematicsSnapshot counts |
| Recent Activity component | Add SyncLog Realtime subscription + initial load of last 10 entries |

---

## Verification Steps

1. Confirm HCSS-011 is implemented and migration 018 is applied
2. Overview page shows three stats: Tracked / Untracked / Total with correct counts
3. Trigger the Edge Function manually from Supabase dashboard
4. Within seconds, a new sync entry appears in Recent Activity without page refresh
5. Confirm error case: if a sync fails, the error entry shows in red with the error message
