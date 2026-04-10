# Change Request: HCSS-004 — Telematics Map View

**Project:** SNC Equipment Tracking  
**Date:** 2026-04-09  
**Status:** IMPLEMENTED ✅  
**Commit (initial):** ef43fd5 (snc-dashboard)  
**Commit (popup make/model):** 2066831 (snc-dashboard)  
**Depends on:** HCSS-003 ✅ (TelematicsSnapshot table populated)  
**Replaces:** Previous Overview map (equipment pins by job + geofence polygons — remove entirely)

---

## Summary

Replace the existing Overview page map with a live telematics map showing the last known GPS position of every tracked machine. Green dot = engine active. Grey dot = engine off. This is the foundation all future map layers (geofences, reconciliation indicators, clustering) will build on.

---

## What Gets Removed

The current Overview map shows:
- Orange geofence polygon overlays per Location
- Equipment pins colored by status (blue/green/red) based on DispatchEvent assignment

**Remove all of this.** It is based on our primitive seeded data model and is no longer meaningful. Replace with the telematics view below.

---

## What Gets Built

### Data Source

Query `TelematicsSnapshot` for the **most recent snapshot per equipment**:

```sql
SELECT DISTINCT ON ("equipmentCode")
  "equipmentCode",
  "latitude",
  "longitude",
  "locationDateTime",
  "isLocationStale",
  "engineStatus",
  "snapshotAt"
FROM "TelematicsSnapshot"
WHERE "latitude" IS NOT NULL
  AND "longitude" IS NOT NULL
ORDER BY "equipmentCode", "snapshotAt" DESC
```

This returns one row per machine — its latest known position. ~586 machines with GPS.

**No separate API endpoint needed.** The dashboard is pure Vite/React with no server layer. Query Supabase directly from the React component using the existing `supabase` client from `src/lib/supabase.ts`. The logged-in user (admin role) bypasses RLS so this works with the anon key + session JWT.

### Map Rendering

**Library:** Mapbox GL JS (already configured in the dashboard)  
**Style:** Keep existing dark-v11 style

**Dot rendering:**
- `engineStatus = "Active"` → **green** dot (`#22c55e`)
- `engineStatus` anything else → **grey** dot (`#6b7280`)
- `isLocationStale = true` → reduce dot opacity to 0.4 (faded, regardless of engine status)
- Dot size: 10px circle

**Popup on click:**
Show a small popup with:
- Make + Model (bold, first line — joined from `Equipment` table by `equipmentCode`)
- Equipment code (grey, second line)
- Engine status (Active / Off)
- Last GPS time (formatted as "X hours ago" or exact time if today)
- Stale indicator if `isLocationStale = true`: "⚠️ GPS stale"

If make/model are blank in E360, fall back to equipment `description` field.

**Note:** Make/model join was added post-initial-implementation (commit 2066831) after James requested it. CR updated retroactively to reflect actual implemented behavior.

**No geofences, no job assignment polygons, no dispatch pins.** Just dots.

### Map Initial View

Center on Reno, NV: `[-119.8138, 39.5296]`, zoom 11. Most of SNC's fleet operates in the Reno/Sparks area so this will show the majority of machines immediately.

---

## Files to Change

**Dashboard repo:** `github.com/james-andrew-walsh/snc-dashboard`

| File | Change |
|------|--------|
| `src/pages/Overview.tsx` (or equivalent) | Replace map initialization + layer logic |
| `src/api/telematics.ts` (new) | API call to fetch latest telematics positions |
| Server-side API route | Add `GET /api/telematics/latest` endpoint using service role key |

Look at how the existing map is initialized in the Overview page and replace the layer/source setup entirely. Keep the Mapbox container and token setup — only the data sources and layers change.

---

## Verification Steps

1. Open dashboard Overview page
2. Map shows ~580 dots around Reno/Sparks area
3. Some dots are green (engine active), most are grey (engine off)
4. Faded dots indicate stale GPS readings
5. Clicking a dot shows popup with equipment code, engine status, last GPS time
6. Old geofence polygons and dispatch pins are gone
7. No console errors

---

## What This Does NOT Include (Next CRs)

- **Clustering** — will be a separate CR once dots are confirmed working
- **Geofence polygons** — comes with HCSS-005 (geofence entry UI)
- **Three-system status bars** — comes with HCSS-007
- **Filtering by job/site** — comes later

---

## Notes for Claude Code

- The dashboard uses React + TypeScript + Vite + Tailwind v4 + Mapbox GL JS
- Auth is Supabase email/password — all API calls require a valid session JWT
- The dashboard is pure Vite/React — no server layer, no API routes. Query Supabase directly from React components using the `supabase` client in `src/lib/supabase.ts`
- The logged-in user is admin role and bypasses RLS — direct client queries work fine
- Look at Overview.tsx and MapboxMap.tsx before replacing anything — understand the existing patterns first
- The map component is in `src/components/MapboxMap.tsx` — the Overview view uses it. You may need to update both.
- Look at other views (Equipment.tsx, JobsLocations.tsx) for the Supabase query patterns to follow
