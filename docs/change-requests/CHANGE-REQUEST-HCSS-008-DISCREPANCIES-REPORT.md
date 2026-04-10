# Change Request: HCSS-008 — Discrepancies Report Page

**Project:** SNC Equipment Tracking  
**Date:** 2026-04-09  
**Status:** READY FOR IMPLEMENTATION  
**Depends on:** HCSS-007b ✅ (get_reconciliation_status RPC live)  
**Repo:** github.com/james-andrew-walsh/snc-dashboard

---

## Summary

Add a Discrepancies page to the dashboard that lists every anomalous machine at each geofenced location in a readable table format. This is the textual companion to the map rings — operators can see exactly which machines have problems, what kind of problem, and act on them.

Scope: geofenced locations only. Machines outside all geofences are not included.

---

## What the Page Shows

### Layout

- Sidebar nav entry: "Discrepancies" (with a red dot badge showing total anomaly count)
- One section per `SiteLocation` that has a drawn geofence (`geom IS NOT NULL`)
- Each section header: location name + summary counts (X anomalies, Y disputed, Z unregistered)
- Each section body: a table of anomalous machines at that location

### Table Columns (per machine)

| Column | Source |
|--------|--------|
| Equipment Code | TelematicsSnapshot.equipmentCode |
| Make & Model | Equipment.make + Equipment.model |
| Engine Status | TelematicsSnapshot.engineStatus (Active / Off) |
| GPS Stale | TelematicsSnapshot.isLocationStale |
| E360 Job | Equipment.jobCode |
| HJ Authorization | JobEquipment records for this site's job codes |
| Status | ANOMALY / DISPUTED / NOT_IN_EITHER |

### Status Definitions (same as map rings)

- **ANOMALY** — E360 assigns machine to this site's job, GPS confirms inside geofence, but HeavyJob has no authorization record
- **DISPUTED** — Machine is inside geofence but E360 and HeavyJob assign it to different jobs
- **NOT_IN_EITHER** — Machine is inside geofence with active engine but has no record in E360 or HeavyJob

**OK machines are not shown** — this is a discrepancies report, not a full roster.

### Sort Order

Within each location section:
1. ANOMALY with engine Active first (highest priority — hours leaking right now)
2. ANOMALY with engine Off
3. NOT_IN_EITHER with engine Active
4. NOT_IN_EITHER with engine Off
5. DISPUTED

---

## Data Source

Call `supabase.rpc('get_reconciliation_status')` (same RPC as the map). Filter to rows where `reconciliation_status != 'OK'` and `reconciliation_status != 'OUTSIDE'`. Group by `site_name`.

Also fetch `SiteLocationJob` records to show which job codes are associated with each location.

---

## Implementation Notes

- Add "Discrepancies" to the Sidebar navigation in `src/components/Sidebar.tsx`
- Create `src/views/Discrepancies.tsx`
- Add route in `src/App.tsx`
- Reuse the existing `supabase` client from `src/lib/supabase.ts`
- If no geofenced locations exist yet, show: "No geofenced locations. Draw a geofence on the Overview map to begin reconciliation."
- If a geofenced location has no anomalies, show: "✓ No discrepancies at this location."
- Style consistent with existing views (dark slate, orange accents for anomalies, yellow for disputed)

---

## Verification

1. Navigate to Discrepancies page
2. West 4th Street Corridor section appears
3. ~22 ANOMALY machines listed, sorted active-engine first
4. ~2 DISPUTED machines listed
5. ~1 NOT_IN_EITHER machine listed (7722)
6. OK machines (17) are NOT shown
7. Each row shows make/model, engine status, E360 job, status badge
8. Sidebar badge shows total anomaly count (25)
