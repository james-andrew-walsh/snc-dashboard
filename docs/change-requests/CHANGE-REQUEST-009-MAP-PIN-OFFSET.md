# Change Request 009: Spread Equipment Pins Within Geofence (Grid Offset)

**Date:** 2026-04-06

---

## Problem

When multiple pieces of equipment are dispatched to the same Location, all markers render at the exact same center coordinate — they stack on top of each other. Only the top marker is visible and clickable.

## Solution

When a Location has multiple equipment pins, spread them in a neat grid pattern within the geofence area rather than stacking them at the center point.

## Implementation

In `MapboxMap.tsx`, in the `addEquipmentMarkers` function, after resolving which equipment belongs to which location, group equipment by location ID and calculate offset coordinates for each.

### Grouping Logic

1. After resolving all (equip, loc) pairs, group by `loc.id`
2. For each group, assign a grid position based on index within the group

### Offset Calculation

Use a simple row/column grid with fixed degree offsets. The spacing should be small enough to stay within typical geofence bounds but large enough to be distinguishable on the map.

**Recommended spacing:** 0.0003 degrees (~30 meters) per cell

**Grid layout** (max 4 columns, wrap to next row):
```
index 0: col 0, row 0  → offset (+0,     +0)
index 1: col 1, row 0  → offset (+0.0003, +0)
index 2: col 2, row 0  → offset (+0.0006, +0)
index 3: col 3, row 0  → offset (+0.0009, +0)
index 4: col 0, row 1  → offset (+0,     -0.0003)
index 5: col 1, row 1  → offset (+0.0003, -0.0003)
... etc
```

Center the grid on the location center by applying a starting offset of `-(cols-1)*spacing/2` horizontally and `+(rows-1)*spacing/2` vertically, so the cluster is centered on the location pin rather than offset to the lower-right.

**Grid centering formula:**
```
totalCols = min(count, 4)
totalRows = ceil(count / 4)
startLng = location.longitude - (totalCols - 1) * spacing / 2
startLat = location.latitude + (totalRows - 1) * spacing / 2

col = index % 4
row = floor(index / 4)
lng = startLng + col * spacing
lat = startLat - row * spacing
```

### Popup Enhancement

Since pins are now spread, the popup should still clearly identify which location the equipment belongs to. Add a "Location: {loc.code}" line to the popup HTML.

## Files Changed

| File | Change |
|---|---|
| `src/components/MapboxMap.tsx` | Group equipment by location, calculate grid offsets before placing markers |

## Validation

After implementation:
1. Open Overview map
2. YARD-01 should show 4 distinct pins in a 2×2 grid, centered on the yard coordinates
3. Each pin should be clickable with its own popup
4. The Komatsu PC210 at JOB-003/LOC-003 (single pin) should remain unaffected
5. Adding more equipment to a location via CLI should cause new pins to appear in the grid
