# Change Request 008: Map Pins for Location-Direct Dispatches

**Date:** 2026-04-06

---

## Problem

The Mapbox map in the Overview view only rendered equipment pins for dispatches routed through a Job (`jobId → Job → locationId → lat/lng`). Dispatches where `jobId` is null and `locationId` is set directly (e.g. equipment parked at a yard) were silently skipped — the marker resolution logic bailed out at `if (!job || !job.locationId) return` with no path for the direct-location case.

This meant yard-parked equipment was invisible on the map despite having valid coordinates in the database.

## Root Cause

The `addEquipmentMarkers` function in `MapboxMap.tsx` had a single resolution path:
```
dispatch.jobId → Job → job.locationId → Location → lat/lng
```

It did not handle the alternative path:
```
dispatch.locationId → Location → lat/lng
```

## Fix

Updated the location resolution logic to handle both cases:

```typescript
let loc = null
if (dispatch.jobId) {
  const job = jobMap.get(dispatch.jobId)
  if (job?.locationId) loc = locMap.get(job.locationId) ?? null
} else if (dispatch.locationId) {
  loc = locMap.get(dispatch.locationId) ?? null
}
if (!loc || !loc.latitude || !loc.longitude) return
```

## Files Changed

| File | Change |
|---|---|
| `src/components/MapboxMap.tsx` | Updated `addEquipmentMarkers` to resolve location via `dispatch.locationId` when `dispatch.jobId` is null |

## Process Note

This fix was applied directly before writing the CR — same pattern as previous deviations (CR-002, CR-003, CR-006b). CR written retroactively. The rule remains: identify problem → write CR → implement. Direct fixes break the spec record.
