# Change Request: HCSS-008b — Map Legend + Reconciliation Info in Popup

**Project:** SNC Equipment Tracking  
**Date:** 2026-04-09  
**Status:** READY FOR IMPLEMENTATION  
**Depends on:** HCSS-007b ✅ (reconciliation rings live on map)  
**Repo:** github.com/james-andrew-walsh/snc-dashboard  
**Files:** src/components/MapboxMap.tsx, src/views/Overview.tsx

---

## Summary

Two additions to the Overview map:

1. **Legend** — a small fixed overlay on the map explaining what each dot color/ring means
2. **Reconciliation info in popup** — when clicking a machine with a problem ring, the popup shows a plain-English description of the problem

---

## Change 1: Map Legend

A small legend card overlaid on the bottom-left (or bottom-right) corner of the map. Always visible.

**Contents:**

```
● Engine Active        (green dot)
● Engine Off           (grey dot)
◌  Stale GPS           (faded/transparent)

─── Reconciliation ───
● ANOMALY              (red ring) — In geofence, no HeavyJob record
● DISPUTED             (yellow ring) — E360 and HeavyJob disagree
● Unregistered         (orange ring) — Not in any system
```

Style: dark semi-transparent background (`bg-slate-900/80`), small text (`text-xs`), orange accent for section header. Compact — should not obscure the map.

Implement as a React component overlaid absolutely on the map container in Overview.tsx (position: absolute, bottom-left, z-index above map).

---

## Change 2: Reconciliation Info in Popup

The existing popup shows: Make/Model, Equipment Code, Engine Status, GPS time, Stale warning.

**When reconciliation_status is ANOMALY, DISPUTED, or NOT_IN_EITHER**, add a section below the existing info with a plain-English problem description:

| Status | Message |
|--------|---------|
| ANOMALY | "⚠️ No HeavyJob authorization — E360 assigns to job [e360_job] but HeavyJob has no record for this site" |
| DISPUTED | "⚠️ Job disagreement — E360: [e360_job] · HeavyJob: [hj_job]" |
| NOT_IN_EITHER | "⚠️ Not in any system — engine active, no E360 or HeavyJob record" |

Style: amber/orange text for the warning line, separator line above it.

**Implementation:** `reconciliation_status` and `e360_job` are already passed as GeoJSON feature properties (from the get_reconciliation_status RPC). Add the problem message to the popup HTML conditionally based on those properties.

---

## Verification

1. Map legend visible in corner — shows all six states
2. Click a green dot with no ring — popup shows no reconciliation section
3. Click a red-ring dot — popup shows ANOMALY message with job code
4. Click a yellow-ring dot — popup shows DISPUTED message with both job codes
5. Click an orange-ring dot — popup shows NOT_IN_EITHER message
6. Legend does not obscure job site markers or controls
