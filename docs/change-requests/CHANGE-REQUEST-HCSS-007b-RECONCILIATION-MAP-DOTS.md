# Change Request: HCSS-007b — Reconciliation Dot Colors on Overview Map

**Project:** SNC Equipment Tracking  
**Date:** 2026-04-09  
**Status:** READY FOR IMPLEMENTATION (after HCSS-006)  
**Depends on:** HCSS-006 ✅ (PostGIS enabled, geom column populated)

---

## Summary

Update the Overview map to color each equipment dot based on its reconciliation status against the geofences that have been drawn. This makes anomalies visible at a glance — no clicking required.

**Verified against real data (2026-04-09):** Running the reconciliation query against the West 4th Street geofence found 42 machines inside. 22 were ANOMALY (E360 assigns them there, HeavyJob has no record), 2 were DISPUTED (E360 and HJ disagree on which job), 1 was NOT_IN_EITHER (active engine, no record in any system).

---

## Visual Design — Ring Approach

Dot **fill color** stays green/grey for engine status (unchanged). Reconciliation status shown via **stroke/outline** only — two signals, one dot.

**Fill (unchanged):**
- Engine Active → green `#22c55e`
- Engine Off → grey `#6b7280`
- Stale GPS → opacity 0.4

**Stroke (new — reconciliation):**

| Status | Stroke | Meaning |
| **ANOMALY** | Red `#ef4444`, 3px | E360 assigns it here, HeavyJob has no record |
| **DISPUTED** | Yellow `#f59e0b`, 3px | E360 and HeavyJob assign different jobs |
| **NOT_IN_EITHER** | Orange `#f97316`, 3px | Inside geofence, no record in either system |
| **OK / OUTSIDE** | Dark `#0f172a`, 1px | Authorized or outside geofence — no alert |

---

## Implementation

### New API endpoint / query

Add a server-side function (or Supabase RPC) that returns reconciliation status per machine. This runs the PostGIS point-in-polygon query and the three-way cross-reference.

**Query logic (runs in Postgres via PostGIS):**

```sql
WITH latest_tel AS (
  SELECT DISTINCT ON ("equipmentCode")
    "equipmentCode", latitude, longitude, "engineStatus", "isLocationStale"
  FROM "TelematicsSnapshot"
  WHERE latitude IS NOT NULL
  ORDER BY "equipmentCode", "snapshotAt" DESC
),
inside_fence AS (
  SELECT t."equipmentCode", s.id as site_id, s.name as site_name,
    array_agg(DISTINCT slj."jobCode") as site_job_codes
  FROM latest_tel t
  JOIN "SiteLocation" s ON ST_Within(
    ST_SetSRID(ST_MakePoint(t.longitude, t.latitude), 4326), s.geom
  )
  JOIN "SiteLocationJob" slj ON slj."siteLocationId" = s.id
  GROUP BY t."equipmentCode", s.id, s.name
),
hj_auth AS (
  SELECT DISTINCT je."equipmentCode", je."jobCode"
  FROM "JobEquipment" je
  JOIN inside_fence f ON je."jobCode" = ANY(f.site_job_codes)
    AND je."equipmentCode" = f."equipmentCode"
),
e360_assign AS (
  SELECT code as "equipmentCode", "jobCode" as e360_job
  FROM "Equipment"
)
SELECT
  t."equipmentCode",
  t."engineStatus",
  t."isLocationStale",
  f.site_name,
  e.e360_job,
  CASE
    WHEN f."equipmentCode" IS NULL THEN 'OUTSIDE'
    WHEN h."equipmentCode" IS NULL AND e.e360_job IS NULL THEN 'NOT_IN_EITHER'
    WHEN h."equipmentCode" IS NULL THEN 'ANOMALY'
    WHEN e.e360_job IS NOT NULL AND NOT (e.e360_job = ANY(f.site_job_codes)) THEN 'DISPUTED'
    ELSE 'OK'
  END as reconciliation_status
FROM latest_tel t
LEFT JOIN inside_fence f ON f."equipmentCode" = t."equipmentCode"
LEFT JOIN hj_auth h ON h."equipmentCode" = t."equipmentCode"
LEFT JOIN e360_assign e ON e."equipmentCode" = t."equipmentCode"
```

### Dashboard changes

**Option A (Supabase RPC):** Create a Postgres function `get_reconciliation_status()` that runs the above query. Call it from the dashboard as `supabase.rpc('get_reconciliation_status')`. Returns one row per machine with `reconciliation_status` field.

**Option B (client-side):** Fetch telematics points, geofences, JobEquipment, and Equipment into the browser; compute reconciliation in JavaScript. Works but heavy for 586+ machines.

**Recommendation: Option A (RPC).** The query is geospatial and belongs in the database. Create as migration 015.

### MapboxMap changes

Leave `circle-color` exactly as-is (green/grey by engine status). Update stroke properties:

```javascript
'circle-stroke-width': [
  'match', ['get', 'reconciliation_status'],
  'ANOMALY', 3,
  'DISPUTED', 3,
  'NOT_IN_EITHER', 3,
  1  // default
],
'circle-stroke-color': [
  'match', ['get', 'reconciliation_status'],
  'ANOMALY', '#ef4444',
  'DISPUTED', '#f59e0b',
  'NOT_IN_EITHER', '#f97316',
  '#0f172a'  // default dark stroke
]
```

---

## Verification

1. Open Overview — machines inside West 4th Street geofence show correct colors
2. Red dots: ~22 machines (ANOMALY) including 7707, 8033, 8060
3. Yellow dots: ~2 machines (DISPUTED) including 9878
4. Orange dot: machine 7722 (NOT_IN_EITHER)
5. Green/grey dots: ~17 machines (OK, engine active/off)
6. Machines outside geofence: unchanged grey dots
7. All stale GPS dots fade to 0.4 opacity regardless of status

---

## Notes for Claude Code

- Both repos need changes: equipment-tracking (migration 015 for the RPC function) and snc-dashboard (MapboxMap.tsx + Overview.tsx)
- The RPC query depends on PostGIS (HCSS-006 must be applied first)
- Pass `reconciliation_status` through the GeoJSON feature properties (like `engineStatus` and `isLocationStale` are currently passed)
