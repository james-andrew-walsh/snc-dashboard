# Change Request: HCSS-013b — Dashboard Reads from Anomaly Table

**Project:** SNC Equipment Tracking
**Date:** 2026-04-10
**Status:** READY FOR IMPLEMENTATION
**Depends on:** HCSS-013 ✅ (Anomaly table + reconciliation Edge Function live)

---

## Summary

The Overview map and Discrepancies page currently call `get_reconciliation_status()` RPC on every page load — a live PostGIS spatial computation that runs ST_Within against all 586 GPS dots for every visitor. The reconciliation Edge Function already runs every 3 hours and writes results to the `Anomaly` table. The dashboard should read from that pre-computed table instead.

**Change:** Replace all calls to `get_reconciliation_status()` RPC with queries to the `Anomaly` table (WHERE `resolvedAt IS NULL` for active anomalies) and a separate query to `TelematicsSnapshot` for the full dot set.

---

## Why This Matters

| Today | After 013b |
|-------|-----------|
| RPC runs full spatial query on every page load | Dashboard reads pre-computed rows from Anomaly table |
| Map dots inside geofences recomputed on demand | Ring status already stored in `anomalyType` + `equipmentCode` |
| If PostGIS has a hiccup, the map breaks | Map and reconciliation are decoupled |
| Latency: ~200–400ms per load (spatial computation) | Latency: simple SELECT |

---

## Data Available in Anomaly Table

```sql
"id", "equipmentCode", "equipmentHcssId", "siteLocationId",
"anomalyType",    -- ANOMALY_NO_HJ | DISPUTED | NOT_IN_EITHER
"severity",       -- warning | error | info
"e360JobCode", "e360LocationName",
"hjJobCode", "hjJobDescription",
"engineStatus", "hourMeter", "latitude", "longitude",
"detectedAt", "resolvedAt",   -- null resolvedAt = active
"reconciliationRunId"
```

Active anomalies: `SELECT * FROM "Anomaly" WHERE "resolvedAt" IS NULL`

---

## Changes Required

### Overview Map (`src/views/Overview.tsx`)

**Current:** Calls `supabase.rpc('get_reconciliation_status')` to get all 586 dots + reconciliation status in one query.

**New approach:**
1. Load all telematics dots from `TelematicsSnapshot` (latest per equipment code — same as the existing `latest_tel` CTE logic, or a new RPC `get_latest_telematics` that returns the same fields)
2. Load active anomalies from `Anomaly` WHERE `resolvedAt IS NULL`
3. Join client-side: for each dot, check if its `equipmentCode` appears in the anomaly list → apply the appropriate ring color

Ring color mapping (unchanged):
- `ANOMALY_NO_HJ` → red ring `#ef4444`
- `DISPUTED` → yellow ring `#eab308`
- `NOT_IN_EITHER` → orange ring `#f97316`
- Not in anomaly list → dark thin stroke `#1e293b`

Popup content: use the anomaly row's fields (`e360JobCode`, `e360LocationName`, `hjJobCode`, `hjJobDescription`, `engineStatus`, `hourMeter`) instead of RPC columns.

### Discrepancies Page (`src/views/Discrepancies.tsx`)

**Current:** Calls `supabase.rpc('get_reconciliation_status')`, filters to non-OUTSIDE/non-OK rows, groups by site.

**New approach:**
1. Load active anomalies from `Anomaly` WHERE `resolvedAt IS NULL`
2. Load `SiteLocation` names to group by site (join via `siteLocationId`)
3. Render the same table — `equipmentCode`, `anomalyType`, plain-English description, `e360JobCode`, `hjJobCode`, `engineStatus`, `hourMeter`

### New RPC: `get_latest_telematics` (optional but preferred)

To keep the dot-loading logic in SQL rather than client-side dedup:

```sql
CREATE OR REPLACE FUNCTION get_latest_telematics()
RETURNS TABLE (
  "equipmentCode" text,
  latitude double precision,
  longitude double precision,
  "locationDateTime" timestamptz,
  "isLocationStale" boolean,
  "engineStatus" text,
  "snapshotAt" timestamptz,
  make text,
  model text,
  description text
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (t."equipmentCode")
    t."equipmentCode", t.latitude, t.longitude, t."locationDateTime",
    t."isLocationStale", t."engineStatus", t."snapshotAt",
    e.make, e.model, e.description
  FROM "TelematicsSnapshot" t
  LEFT JOIN "Equipment" e ON e.code = t."equipmentCode"
  WHERE t.latitude IS NOT NULL
  ORDER BY t."equipmentCode", t."snapshotAt" DESC
$$;
```

This replaces the dot-loading portion of `get_reconciliation_status`. The reconciliation status comes from the `Anomaly` table join, not this RPC.

---

## Migration Required

**Migration 021** — add `get_latest_telematics()` RPC:

File: `core/supabase/migrations/021_get_latest_telematics_rpc.sql`

Contents: the CREATE OR REPLACE FUNCTION above.

Apply to both demo and production Supabase projects before deploying dashboard changes.

---

## Files to Modify

- `src/views/Overview.tsx` — replace RPC call; new two-query approach; update ring logic and popup
- `src/views/Discrepancies.tsx` — replace RPC call; query Anomaly + SiteLocation directly

## Files to Create

- `core/supabase/migrations/021_get_latest_telematics_rpc.sql`

---

## Testing

After implementation:
1. Open Overview map — should show same 586 dots, same ring colors as before
2. Open Discrepancies page — should show same 24 anomalies (20 ANOMALY_NO_HJ, 4 DISPUTED)
3. Verify popup content matches what was shown before (equipment info + job codes + engine status)
4. Confirm `get_reconciliation_status()` RPC is no longer called (check Network tab)

---

## What Does NOT Change

- The `get_reconciliation_status()` RPC stays in the database — do not drop it
- The reconciliation Edge Function continues writing to the Anomaly table every 3 hours
- All other dashboard pages are unaffected
- No new migrations to the Anomaly table itself
