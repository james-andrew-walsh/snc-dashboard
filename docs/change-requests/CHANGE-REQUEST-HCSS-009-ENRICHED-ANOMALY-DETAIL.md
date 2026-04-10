# Change Request: HCSS-009 — Enriched Anomaly Detail in Popup and Discrepancies List

**Project:** SNC Equipment Tracking  
**Date:** 2026-04-09  
**Status:** READY FOR IMPLEMENTATION  
**Depends on:** HCSS-008 ✅, HCSS-008b ✅  
**Repos:** snc-dashboard, equipment-tracking (migration for updated RPC)

---

## Summary

Show all available information about each anomaly — not just the status label but the full context: what each system says, what it disagrees about, and the hour meter reading as a proxy for billing exposure.

Changes needed in two places: the map popup and the Discrepancies page table.

---

## Data Available Per Machine

These fields are already in the database and can be returned by the RPC:

| Field | Source | Available for |
|-------|--------|---------------|
| `e360_job` | Equipment.jobCode | All statuses |
| `e360_location` | Equipment.locationName | All statuses |
| `hj_job` | JobEquipment.jobCode | DISPUTED |
| `hj_job_description` | Job.description (join on jobCode) | DISPUTED |
| `hour_meter` | TelematicsSnapshot — need to add to RPC | All statuses |
| `last_gps_time` | TelematicsSnapshot.locationDateTime | All statuses |
| `site_name` | SiteLocation.name | All statuses |
| `site_job_codes` | SiteLocationJob.jobCode array | All statuses |

---

## Updated RPC: `get_reconciliation_status()`

The existing RPC needs to return additional fields. Update migration 015 (or create 016 as a replacement) to add:

- `e360_location` — `Equipment.locationName`
- `hj_job` — the conflicting HeavyJob job code (for DISPUTED machines)
- `hj_job_description` — description of the HJ job (join `Job` table on `hj_job`)
- `hour_meter` — `TelematicsSnapshot.lastHourMeterReadingInHours` (if available in snapshot)

---

## Popup Changes (MapboxMap.tsx)

Pass the new fields through GeoJSON feature properties. Update the popup HTML for each status:

**ANOMALY:**
```
⚠️ No HeavyJob authorization
E360 assigns to: 11791
E360 location: RTC W 4TH STREET
Hour meter: 3,241 hrs
```

**DISPUTED:**
```
⚠️ Job disagreement
E360 assigns to: 11798 (job description if available)
HeavyJob assigns to: 11791 — RTC - WEST FORTH STREET SAFETY
Hour meter: 1,847 hrs
```

**NOT_IN_EITHER:**
```
⚠️ Not in any system
No E360 or HeavyJob record found
Hour meter: 892 hrs
GPS: 2 hours ago
```

---

## Discrepancies Page Changes (Discrepancies.tsx)

Add columns to the table:

| New Column | ANOMALY | DISPUTED | NOT_IN_EITHER |
|------------|---------|----------|---------------|
| E360 Location | ✅ show | ✅ show | — |
| HJ Job | — | ✅ show HJ job code + description | — |
| Hour Meter | ✅ show | ✅ show | ✅ show |

---

## Migration 016: Update get_reconciliation_status() RPC

Replace the existing function body to return the additional fields. The function signature stays the same (no breaking change to callers — just additional columns in the result).

Key joins to add:
- `LEFT JOIN "Equipment" e ON e.code = t."equipmentCode"` → get `locationName`
- `LEFT JOIN "JobEquipment" hj_conflict ON hj_conflict."equipmentCode" = t."equipmentCode" AND hj_conflict."jobCode" NOT IN (site job codes)` → get conflicting HJ job for DISPUTED
- `LEFT JOIN "Job" j ON j.code = hj_conflict."jobCode"` → get HJ job description

---

## Verification

1. Click a red-ring machine — popup shows E360 job, E360 location name, hour meter
2. Click a yellow-ring machine — popup shows both E360 and HJ job codes with descriptions
3. Click an orange-ring machine — popup shows hour meter and GPS time
4. Discrepancies page table shows E360 location and HJ job columns where applicable
5. Hour meter values are plausible (thousands of hours for heavy equipment)
