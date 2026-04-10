# Change Request 006: Mapbox Map View on Overview Page

**Date:** 2026-04-06
**Priority:** High — key visual for demo and operational situational awareness

---

## Background

The Overview page currently shows metric cards and a recent activity feed. We want to embed an interactive Mapbox map as the primary visual on that page, showing all active job sites as geofenced polygons with equipment pins for each assigned machine.

The dashboard scaffold already includes a `MapboxMap.tsx` placeholder and the `VITE_MAPBOX_TOKEN` env var is now set in Vercel.

---

## Migration Required: Add Lat/Lng to Location

The `Location` table currently has no geographic coordinates. We need to add them.

### Migration 005: `005_add_location_coordinates.sql`

```sql
ALTER TABLE "Location" 
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "geofence" JSONB;
```

- `latitude` / `longitude`: center point of the location/job site
- `geofence`: a GeoJSON polygon (array of [lng, lat] coordinate pairs) defining the site boundary

### Seed Realistic Coordinates

After applying the migration, update all existing Location records with real coordinates:

| Code | Description | Center Lat | Center Lng | Notes |
|---|---|---|---|---|
| YARD-01 | Main Equipment Yard | 39.5296 | -119.8138 | Reno industrial area near I-80 |
| LOC-002 | Sparks Equipment Yard — Greg Street | 39.5349 | -119.7527 | Greg St, Sparks NV |
| LOC-003 | South Reno Staging Yard — Veterans Pkwy | 39.4721 | -119.7882 | Veterans Pkwy, South Reno |
| LOC-004 | Fernley Overflow Yard — US-50 | 39.6077 | -119.2521 | US-50, Fernley NV |

### Geofence Polygons

Each geofence is a rough hand-drawn rectangle approximating the job site boundary. Use these GeoJSON coordinate arrays (longitude first per GeoJSON spec, then latitude):

**YARD-01** (~300m × 200m rectangle):
```json
[[-119.8158, 39.5286], [-119.8118, 39.5286], [-119.8118, 39.5306], [-119.8158, 39.5306], [-119.8158, 39.5286]]
```

**LOC-002** (~250m × 200m rectangle):
```json
[[-119.7547, 39.5339], [-119.7507, 39.5339], [-119.7507, 39.5359], [-119.7547, 39.5359], [-119.7547, 39.5339]]
```

**LOC-003** (~300m × 250m rectangle):
```json
[[-119.7902, 39.4711], [-119.7862, 39.4711], [-119.7862, 39.4731], [-119.7902, 39.4731], [-119.7902, 39.4711]]
```

**LOC-004** (~400m × 250m rectangle):
```json
[[-119.2541, 39.6067], [-119.2501, 39.6067], [-119.2501, 39.6087], [-119.2541, 39.6087], [-119.2541, 39.6067]]
```

Apply these as UPDATE statements after the migration.

---

## Frontend Changes

### 1. Update `src/lib/types.ts`
Add to `Location` interface:
```typescript
latitude: number | null
longitude: number | null
geofence: number[][] | null  // array of [lng, lat] pairs
```

### 2. Update `src/views/Overview.tsx`
Embed the map as the primary visual element below the metric cards. The map should take up most of the page height (e.g. `h-[500px]` or `h-[60vh]`).

Pass the following data to the map component:
- All `Location` records (with lat/lng/geofence)
- Active `DispatchEvent` records (startDate ≤ today, endDate null or ≥ today)
- All `Equipment` records (for make/model/code/status lookup)
- All `Job` records (to resolve jobId → locationId → coordinates)

### 3. Update/Replace `src/components/MapboxMap.tsx`

Replace the placeholder with a real implementation using `mapbox-gl` (already in package.json from the original scaffold — verify with `cat package.json | grep mapbox`).

**Map behavior:**

**Base map:** `mapbox://styles/mapbox/dark-v11` — matches the dark industrial dashboard theme.

**Initial view:** Centered on Reno, NV — `[-119.8138, 39.5296]`, zoom 10.

**Geofence polygons:** For each Location with a geofence:
- Render as a filled polygon layer (`fill-color: rgba(249, 115, 22, 0.15)` — orange-500 at 15% opacity)
- Render outline (`line-color: rgb(249, 115, 22)`, `line-width: 2`) — orange-500

**Equipment pins:** For each active DispatchEvent:
- Resolve: equipmentId → Equipment (make/model/code/status), jobId → Job → locationId → Location (lat/lng)
- Render a marker at the job site center coordinates
- Marker color based on equipment status: Available = blue-500, In Use = green-500, Down = red-500
- On click: show popup with equipment details (make, model, code, status, operator name)

**Job site labels:** A text label at the center of each geofenced location showing the job code(s) assigned to that location.

**Unassigned equipment:** Do not show on map (no location to pin to).

**Props interface:**
```typescript
interface MapboxMapProps {
  locations: Location[]
  activeDispatches: DispatchEvent[]
  equipment: Equipment[]
  jobs: Job[]
  employees: Employee[]
}
```

---

## Mapbox Token

Token is already set in Vercel as `VITE_MAPBOX_TOKEN`. Reference in code as `import.meta.env.VITE_MAPBOX_TOKEN`.

---

## Files to Create/Update

| File | Change |
|---|---|
| `core/supabase/migrations/005_add_location_coordinates.sql` | New migration |
| `src/components/MapboxMap.tsx` | Replace placeholder with real implementation |
| `src/views/Overview.tsx` | Embed map, fetch and pass data |
| `src/lib/types.ts` | Add lat/lng/geofence to Location type |

---

## Instructions for Claude Code

1. Read `EQUIPMENT-TRACKING-PROJECT.md` for full project context
2. Read `core/CHANGE-REQUEST-006-MAP-VIEW.md` (this file)
3. Apply migration 005 via Supabase Management API (same pattern as previous migrations — see memory/2026-04-05.md for the curl command with required `User-Agent: curl/8.1.2` header)
4. After migration, run UPDATE statements to seed coordinates for all 4 locations
5. Verify `cat package.json | grep mapbox` — if mapbox-gl is not present, run `npm install mapbox-gl`
6. Implement MapboxMap.tsx and update Overview.tsx
7. `npm run build` — fix any TypeScript errors
8. Commit and push

## Validation

After deployment:
1. Open the Overview page
2. Should see a dark Mapbox map centered on Reno
3. Should see 4 orange geofenced polygons at the correct real-world locations
4. Should see equipment pins on job sites that have active dispatches
5. Clicking a pin shows a popup with equipment details
