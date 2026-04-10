# Change Request: HCSS-007 — Telematics Map View & Status Indicators

**Project:** SNC Equipment Tracking  
**Date:** 2026-04-09  
**Status:** DRAFT  
**Depends on:** HCSS-001 (jobs synced), HCSS-003 (telematics snapshots), HCSS-004 (site locations + geofences), HCSS-006 (reconciliation engine + anomaly records)

---

## Summary

Make the map the primary operational surface. Every GPS-tracked machine appears as a dot on the map. Each dot carries a compact three-system status indicator showing whether HeavyJob, E360, and telematics all agree about where the machine is and what job it is on. Operators can filter by site, job, or status — and see at a glance exactly what the reconciliation session at West 4th Street revealed manually.

---

## The Vision

On the morning of 2026-04-09, James drove to the West 4th Street job site and manually ran the reconciliation logic: pull E360 assignment, pull HeavyJob jobEquipment, compare with telematics GPS, flag disagreements. The goal of this CR is to make that same analysis visible in the app, automatically, for every tracked machine on every active job site.

**Target state:** Open the dashboard, select "West 4th Street Corridor," and immediately see:
- All machines physically on site as dots on the map
- Each dot colored and annotated by reconciliation status
- A sidebar showing the job codes associated with this location (33216, 11791)
- Machines that are physically present but not assigned to any job — flagged clearly
- Machines assigned to the job but GPS shows elsewhere — flagged clearly

---

## Map Layer: Equipment Dots

### Data Source
All equipment with a `TelematicsSnapshot` from the last 24 hours. ~470 machines.

GPS positions older than 4 hours are marked **stale** and displayed differently (faded dot with clock icon).

### Dot Colors — Engine Status
| Color | Meaning |
|-------|---------|
| 🟢 Green | Engine Active — machine is running right now |
| ⚫ Grey | Engine Off — parked |
| 🟡 Yellow | Idle — engine on but not moving (future: when speed data available) |
| 🔵 Blue (faded) | GPS stale (>4 hours old) |

### Dot Click — Equipment Detail Panel
Clicking any dot opens a side panel showing:
- Equipment code, description, make/model/year
- Current GPS coordinates and last-seen timestamp
- Three-system status indicator (see below)
- Active anomalies for this machine (links to anomaly detail)
- Engine hours (latest telematics reading)

---

## Three-System Status Indicator

The key new UI component. Each machine on the map has a compact status bar with three segments, one per data source. When all three agree, the bar is all green. When something disagrees, the relevant segment turns orange or red.

```
┌─────────────────────────────────┐
│ HJ  │  E360  │  TEL             │
│ ✅  │  ✅    │  ✅  All agree   │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ HJ  │  E360  │  TEL             │
│ ⚠️  │  ✅    │  ✅  HJ mismatch │
└─────────────────────────────────┘
```

### Segment Logic

**HJ (HeavyJob):**
- ✅ Green: Machine has an active `jobEquipment` record for a job associated with its current geofence location
- ⚠️ Orange: Machine is GPS-inside a location's geofence but has NO `jobEquipment` record for any job at that location
- ❌ Red: Machine has `jobEquipment` records but all of them are for jobs at different locations

**E360:**
- ✅ Green: E360 `jobCode` on the equipment record matches a job associated with its current geofence location
- ⚠️ Orange: E360 has the machine on a different job, but that job is also at this location (acceptable — different contract, same site)
- ❌ Red: E360 `jobCode` is a job at a different location entirely

**TEL (Telematics):**
- ✅ Green: GPS is inside a `SiteLocation` geofence that has at least one job this machine is assigned to
- ⚠️ Orange: GPS is inside a geofence, but machine is not assigned to any job at this location
- ❌ Red: GPS is outside all geofences (machine is somewhere unaccounted for)
- 🔵 Blue: GPS is stale (>4 hours) — cannot determine location

### Summary Status (dot outline color)
The dot's outline color summarizes the worst segment:
- No outline: all green
- Orange outline: at least one ⚠️, no ❌
- Red outline + pulsing: at least one ❌ — anomaly detected, needs attention

---

## Filtering and Focus

### Site Filter
Dropdown at top of map: "All Sites" or select a named `SiteLocation`. Selecting a site:
- Zooms map to that site's geofence
- Shows only machines inside or assigned to jobs at that location
- Highlights the geofence polygon
- Shows the job list for that location in the sidebar

### Job Filter
Once a site is selected, filter further to a single job code. Shows only machines with HeavyJob or E360 assignment to that specific job.

### Status Filter
Filter by status: All / Anomalies Only / Active (engine running) / Stale GPS

---

## Dashboard Integration

### Overview Page Updates
The existing Overview page (`/`) gains:
- A "Sites" quick-filter at the top
- Equipment dots on the existing Mapbox map (dots layer on top of the Location marker layer already there)
- Status indicator on each dot (simplified — just dot outline color, full three-bar on click)
- Anomaly count badge updated in real time as reconciliation runs

### Locations Page (`/locations`) — from HCSS-004
The Locations page gains the same equipment dot layer. When the operator is drawing or editing a geofence, the equipment dots stay visible so they can draw around the machines they can see.

---

## Schema Changes

No new tables. This CR reads from:
- `TelematicsSnapshot` (HCSS-003)
- `SiteLocation` + `SiteLocationJob` (HCSS-004)
- `Anomaly` (HCSS-006)
- `Equipment` (HCSS-001, for make/model/description)
- HeavyJob `jobEquipment` endpoint (live query or cached in new `JobEquipmentCache` table — see note below)

### Optional: `JobEquipmentCache` table

The `jobEquipment` endpoint requires a per-job query. With 235 active jobs, querying all of them on every dashboard load is not feasible. Options:

**Option A (recommended for MVP):** Cache `jobEquipment` records during HCSS sync. Add to HCSS-001 sync: after syncing jobs, query `jobEquipment` for all active jobs and store results in a flat `JobEquipmentCache` table.

```sql
CREATE TABLE IF NOT EXISTS "JobEquipmentCache" (
    "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "jobHcssId"           uuid NOT NULL,
    "jobCode"             text NOT NULL,
    "equipmentHcssId"     uuid,
    "equipmentCode"       text NOT NULL,
    "equipmentDescription" text,
    "isActive"            boolean NOT NULL DEFAULT true,
    "syncedAt"            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON "JobEquipmentCache"("equipmentCode");
CREATE INDEX ON "JobEquipmentCache"("jobCode");
CREATE INDEX ON "JobEquipmentCache"("isActive");
```

This table is wiped and rebuilt on every HCSS sync (not value-add — it is a mirror). With it, the three-system status indicator can be computed entirely from local data.

**Option B:** Query live on demand (acceptable for low-traffic MVP, may be slow).

---

## Verification Steps

1. Run HCSS-001 sync (including jobEquipment cache if Option A)
2. Run HCSS-003 telematics snapshot
3. Create "West 4th Street Corridor" location with jobs 33216 and 11791 (HCSS-004)
4. Open `/locations`, select West 4th Street Corridor
5. Verify equipment dots appear on map at correct GPS positions
6. Verify green dots for machines inside geofence assigned to either job
7. Verify orange/red outline for the machines we identified manually (8033, 7707, 8060, 7763, 7727)
8. Click a dot — verify three-system status bar shows correct state for each segment
9. Verify stale GPS machines (like 9809) show blue/faded
10. Filter to job 33216 only — verify dot set changes correctly

---

## Follow-On Work

- Real-time updates: subscribe to `TelematicsSnapshot` insert events via Supabase Realtime — dots move as snapshots come in
- Alerting: push critical anomaly dots to Telegram via OpenClaw when reconciliation runs
- Mobile view: responsive map for use on a phone at a job site
- Historical replay: scrub through time to see where machines were at any point in the past
