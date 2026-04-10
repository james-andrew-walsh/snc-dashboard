# Change Request: HCSS-005 — Geofence Entry UI

**Project:** SNC Equipment Tracking  
**Date:** 2026-04-08  
**Updated:** 2026-04-09  
**Status:** READY FOR IMPLEMENTATION  
**Depends on:** HCSS-001 ✅, HCSS-003 ✅, HCSS-004 ✅ (telematics map patterns established)

---

## Summary

Add a Location management system to the dashboard that lets a human operator:
1. Create named **Locations** (physical sites like "West 4th Street Corridor")
2. Associate one or more HCSS job codes with each Location
3. Draw a geofence polygon directly on the map by clicking points
4. See live telematics equipment dots on the same map while drawing

This is the geographic foundation the reconciliation engine requires. The key design insight from live site testing: **geofences belong to physical locations, not to individual job codes.** One location can have multiple job codes. Equipment is reconciled against the location's geofence, not a per-job boundary.

---

## The Problem This Solves

HCSS has no geography. Jobs have no coordinates. Equipment telematics knows where every machine is but has nothing to compare against. This CR adds the missing layer.

**Live validation (2026-04-09):** West 4th Street between McCarran and Keystone has two active job codes (33216 and 11791) sharing the same physical corridor. Equipment is split between them in E360 and HeavyJob with no consistent logic. A single geofence drawn around the corridor resolves both jobs simultaneously. Any machine inside the boundary that is authorized to charge to either job is correctly placed.

---

## Schema Changes

### Migration 013: `SiteLocation` and `SiteLocationJob`

**File:** `core/supabase/migrations/013_add_site_location.sql`

### New Table: `SiteLocation` (value-add — never wiped)

A named physical location that can contain multiple job codes.

```sql
CREATE TABLE IF NOT EXISTS "SiteLocation" (
    "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name"        text NOT NULL,          -- e.g. "West 4th Street Corridor"
    "description" text,
    "centerLat"   double precision,       -- map center for this location
    "centerLng"   double precision,
    "polygon"     jsonb,                  -- GeoJSON polygon drawn by operator
    "radiusMeters" integer,               -- optional: simple circular geofence
    "createdBy"   uuid REFERENCES "user_profiles"("id"),
    "createdAt"   timestamptz NOT NULL DEFAULT now(),
    "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
```

### New Table: `SiteLocationJob` (value-add — never wiped)

Many-to-many: which job codes belong to a location.

```sql
CREATE TABLE IF NOT EXISTS "SiteLocationJob" (
    "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "siteLocationId" uuid NOT NULL REFERENCES "SiteLocation"("id") ON DELETE CASCADE,
    "jobHcssId"      uuid NOT NULL,
    "jobCode"        text NOT NULL,
    "jobDescription" text,
    "createdAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON "SiteLocationJob"("siteLocationId", "jobCode");
CREATE INDEX ON "SiteLocationJob"("jobCode");
```

**Note:** The existing `Location` table (from migration 005) is the E360 location mirror — it is a different concept. `SiteLocation` is our value-add geographic container. They can be linked in the future but are separate for now.

---

## Dashboard Changes

### Integrated into Overview page (no new route)

All geofence management lives on the existing Overview page alongside the telematics dots map. No separate `/locations` page. The operator sees the machines and draws boundaries around them in the same view.

**Map additions (on top of existing telematics dots):**
- **Existing geofence polygons** — all saved `SiteLocation` polygons rendered as faint orange outlines with the location name as a label.
- **Draw mode** — when active, operator clicks points on the map to define a polygon. Equipment dots remain visible during drawing.

**UI additions to Overview page:**
- A collapsible **Locations panel** (right side or bottom of map, or as a floating card). Lists all `SiteLocation` records: name, job count, geofence status.
- A **“+ New Location” button** that opens an inline form.
- A **Draw Geofence button** that activates Mapbox Draw on the map.

**Workflow — creating a new Location:**
1. Operator clicks "+ New Location".
2. Enters a name (e.g. "West 4th Street Corridor") and optional description.
3. Searches for and adds job codes from the synced job list (typeahead by code or description). Multiple jobs supported.
4. Clicks "Draw Geofence" — map enters Mapbox Draw polygon mode.
5. Operator clicks points on the map around the machines they can see.
6. Double-clicks or clicks first point to close the polygon.
7. Operator clicks Save — saves `SiteLocation` + `SiteLocationJob` records. Polygon appears as orange outline on map.

**Workflow — editing an existing Location:**
- Click location in the panel → polygon becomes editable (Mapbox Draw edit mode, drag vertices).
- Add/remove job codes.
- Save.

**Library:** Use `@mapbox/mapbox-gl-draw` (npm install) for polygon drawing. It integrates directly with the existing Mapbox GL JS instance.

**Visual indicators on map:**
- Equipment dots: unchanged from HCSS-004 (green/grey/faded)
- Geofence polygons: faint orange fill (`rgba(249,115,22,0.15)`), orange stroke (`#f97316`)
- Location name label centered on polygon

---

## Access Control

- Requires `dispatcher` or `admin` role to create/edit locations and geofences
- `read_only` and agent roles can view but not edit
- RLS policies on `SiteLocation` and `SiteLocationJob` follow existing patterns

---

## Verification Steps

1. Apply `SiteLocation` and `SiteLocationJob` migrations
2. Log in as admin
3. Navigate to `/locations`
4. Verify equipment dots appear on the map (requires HCSS-003 snapshots)
5. Create "West 4th Street Corridor" location, add jobs 33216 and 11791
6. Draw polygon around the West 4th corridor
7. Verify `SiteLocation` and two `SiteLocationJob` records in database
8. Re-run HCSS sync — verify geofence records untouched
9. Verify polygon appears on Overview map

---

## Follow-On Work

- HCSS-006: `snc location` CLI commands
- HCSS-007: Reconciliation engine uses `SiteLocation` + `SiteLocationJob`
- HCSS-008: Equipment status indicators on map (per-machine three-system status bar)
- Future: Auto-suggest polygon from telematics cluster
- Future: Mobile geofence drawing
