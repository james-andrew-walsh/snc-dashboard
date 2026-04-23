# Change Request: HCSS-005b — Location Edit/Delete + Job Details in List

**Project:** SNC Equipment Tracking  
**Date:** 2026-04-09  
**Status:** READY FOR IMPLEMENTATION  
**Depends on:** HCSS-005 ✅  
**Repo:** github.com/james-andrew-walsh/snc-dashboard

---

## Summary

Two additions to the Location panel on the Overview page:

1. **Edit/Delete per location** — clicking a location in the list opens an edit mode that lets the user update the geofence polygon or delete the location entirely.
2. **Show job IDs and names in the list** — instead of "1 job · Geofenced", show each attached job's code and description.

---

## Change 1: Edit and Delete

### Current behavior
Locations appear as static list items. No way to modify or remove them.

### Required behavior

**In the location list**, each location row gets two icon buttons: ✏️ Edit and 🗑️ Delete.

**Edit flow:**
1. User clicks Edit on a location.
2. The existing "new location" form opens pre-populated with that location's name, description, and attached jobs.
3. A "Redraw Geofence" button lets the user draw a new polygon (replaces the existing one).
4. Save updates the `SiteLocation` record and replaces `SiteLocationJob` records (delete existing, insert new).
5. Cancel closes the form without changes.

**Delete flow:**
1. User clicks Delete.
2. A simple confirm: "Delete [name]? This cannot be undone." — inline confirmation, not a browser dialog.
3. Confirm deletes the `SiteLocation` record (cascade deletes `SiteLocationJob` records via FK).
4. Location disappears from the list and its polygon is removed from the map.

---

## Change 2: Show Job Codes and Names in Location List

### Current behavior
Location list shows: `Name · 1 job · Geofenced` (or similar summary).

### Required behavior
Show each attached job explicitly. For a location with two jobs:

```
West 4th Street Corridor   [Edit] [Delete]
  33216 — QD-RTC 4TH ST PED IMPROVEMENTS 17175
  11791 — RTC - WEST FORTH STREET SAFETY
  ✓ Geofenced
```

Job data comes from `SiteLocationJob.jobCode` and `SiteLocationJob.jobDescription` (already stored when the location is saved).

---

## Implementation Notes

- Edit and delete operations use the `supabase` client directly (same pattern as save).
- For edit: UPDATE `SiteLocation`, then DELETE all `SiteLocationJob` for that location and re-INSERT the new set.
- For delete: DELETE `SiteLocation` — FK cascade handles `SiteLocationJob`.
- The location list already has access to `siteLocationJobs` state — use it to find jobs for each location by `siteLocationId`.
- Keep all changes within `src/views/Overview.tsx` (and `src/components/MapboxMap.tsx` if geofence layer needs updating after delete).

---

## Verification

1. Open Overview, see existing locations with job codes listed under each
2. Click Edit on a location — form opens pre-populated
3. Change name, save — list updates immediately
4. Click Delete — inline confirm appears
5. Confirm delete — location gone from list and polygon gone from map
6. Add a new location — job codes appear in the list immediately after save
