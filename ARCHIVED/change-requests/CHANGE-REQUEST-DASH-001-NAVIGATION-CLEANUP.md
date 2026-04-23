# Change Request: DASH-001 — Dashboard Navigation Cleanup

**Project:** SNC Equipment Tracking
**Date:** 2026-04-10
**Status:** READY FOR IMPLEMENTATION
**Depends on:** None

---

## Summary

Remove the Dispatch Schedule, Crew Assignments, and Employees pages entirely. Remove the Dispatch Events stat card from the Overview page. Split the Jobs & Locations page into two separate pages: Jobs and Locations.

---

## Changes Required

### 1. Remove: Dispatch Schedule

- Remove `dispatch` nav entry from `src/components/Sidebar.tsx`
- Remove `src/views/DispatchSchedule.tsx` (delete the file)
- Remove the `dispatch` case from the router/view switcher in `src/App.tsx` (or wherever views are rendered by id)
- Remove any `DispatchIcon` import/definition from `Sidebar.tsx` if no longer used

### 2. Remove: Dispatch Events stat card from Overview

In `src/views/Overview.tsx`:
- Remove the `dispatchCount` state variable
- Remove the `DispatchEvent` query from the initial data fetch
- Remove the `DispatchEvent` realtime subscription
- Remove the `Dispatch Events` `<StatCard>` (or equivalent) from the rendered JSX — the one currently showing `dispatchCount`
- Clean up any imports/types only used for dispatch count

### 3. Remove: Crew Assignments

- Remove `crew-assignments` nav entry from `src/components/Sidebar.tsx`
- Remove `src/views/CrewAssignments.tsx` (delete the file)
- Remove the `crew-assignments` case from the view router
- Remove `CrewIcon` import/definition from `Sidebar.tsx` if no longer used

### 4. Remove: Employees

- Remove `employees` nav entry from `src/components/Sidebar.tsx`
- Remove `src/views/Employees.tsx` (delete the file)
- Remove the `employees` case from the view router
- Remove `EmployeesIcon` import/definition from `Sidebar.tsx` if no longer used

### 5. Split: Jobs & Locations → Jobs + Locations

**Current:** One `jobs-locations` nav entry pointing to `src/views/JobsLocations.tsx`

**New:**
- Replace `jobs-locations` with two separate nav entries:
  - `{ id: 'jobs', label: 'Jobs', icon: <JobsIcon /> }`
  - `{ id: 'locations', label: 'Locations', icon: <LocationsIcon /> }`
- Create `src/views/Jobs.tsx` — contains only the jobs table/content from `JobsLocations.tsx`
- Create `src/views/Locations.tsx` — contains only the locations table/content from `JobsLocations.tsx`
- Delete `src/views/JobsLocations.tsx`
- Add both new cases to the view router
- Add a `LocationsIcon` to `Sidebar.tsx` (can reuse a map pin or similar SVG consistent with existing icon style)

**Nav order after changes (top to bottom):**
1. Overview
2. Magnet Board
3. Business Units
4. Jobs
5. Locations
6. Equipment
7. Discrepancies
8. Admin

---

## Files to Modify

- `src/components/Sidebar.tsx` — remove 3 nav entries, add 1, replace 1 with 2
- `src/views/Overview.tsx` — remove dispatch events stat card + related state/subscriptions
- `src/App.tsx` (or view router) — remove 3 view cases, add 2 new ones

## Files to Delete

- `src/views/DispatchSchedule.tsx`
- `src/views/CrewAssignments.tsx`
- `src/views/Employees.tsx`
- `src/views/JobsLocations.tsx`

## Files to Create

- `src/views/Jobs.tsx`
- `src/views/Locations.tsx`

---

## What Does NOT Change

- Magnet Board — leave as-is
- Overview page (except removing Dispatch Events stat card)
- Equipment page
- Discrepancies page
- Admin page
- Business Units page
- All database tables, RLS policies, and realtime subscriptions remain untouched — this is frontend cleanup only

---

## Testing

After implementation:
1. Sidebar shows: Overview, Magnet Board, Business Units, Jobs, Locations, Equipment, Discrepancies, Admin
2. Dispatch Schedule, Crew Assignments, Employees are gone — no broken links, no console errors
3. Overview page loads without Dispatch Events stat card; other stat cards intact
4. Jobs page shows jobs table only
5. Locations page shows locations table only
6. No TypeScript compilation errors
