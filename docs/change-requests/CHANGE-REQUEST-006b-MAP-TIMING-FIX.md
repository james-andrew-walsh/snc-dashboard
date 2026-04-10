# Change Request 006b: Fix Map Geofence Rendering (Timing Bug)

**Date:** 2026-04-06
**Relates to:** CR-006

---

## Problem

After CR-006 was deployed, the Mapbox map displayed correctly (dark style, centered on Reno) but no geofence polygons or equipment pins appeared.

**Root cause:** The `MapboxMap` component initialized the map once on mount (`useEffect` with `[]` deps). The `map.on("load")` callback attempted to add geofence polygon layers from the `locations` prop — but `locations` was still an empty array at that moment because the Supabase data fetch had not yet completed. The load event fired before the data arrived, resulting in a no-op.

---

## The Fix

Separated map initialization from data rendering into two distinct `useEffect` hooks:

**Effect 1 — Map initialization (runs once):**
- Creates the Mapbox map instance
- Adds navigation control
- Sets `isLoaded` state to `true` via `map.on("load", ...)`

**Effect 2 — Data rendering (runs when both map is loaded AND data is available):**
- Dependencies: `[isLoaded, locations, activeDispatches, equipment, jobs, employees]`
- Returns early if `!isLoaded` or map not initialized
- Safely removes previously added layers and sources (tracked via refs) before re-adding
- Adds geofence fill + line layers for all locations with geofence data
- Adds location code labels as symbol layer
- Adds equipment markers with status-colored dots and click popups

This ensures geofences and markers are always rendered after both the map style has loaded AND the data has arrived from Supabase.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/MapboxMap.tsx` | Refactored to two-effect pattern with isLoaded state and safe layer/source cleanup |
