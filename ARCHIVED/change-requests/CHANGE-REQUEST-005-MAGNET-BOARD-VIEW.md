# Change Request 005: Magnet Board View

**Date:** 2026-04-06
**Priority:** High — core operational view for dispatchers

---

## Background

HCSS Dispatcher includes a "Magnet Board" — a visual grid showing all active jobs as cards, with equipment and crew assigned to each. It gives a dispatcher an at-a-glance picture of the entire fleet: what's where, who's on what, and what's unassigned.

We want a simpler, cleaner version of this concept built into the SNC dashboard as a new view.

---

## Design Concept

A responsive card grid — one card per active Job — showing the crew and equipment currently assigned to that job. A separate "Unassigned" section at the bottom (or side) shows equipment with no active DispatchEvent.

This view is **read-only in V1** — no drag-and-drop. Real-time via Supabase subscriptions (same pattern as other views).

---

## Layout

### Header
- View title: "Magnet Board"
- Date indicator: "As of [today's date]"

### Job Cards (grid, 2-3 columns on desktop, 1 on mobile)

Each card represents one active Job and contains:

**Card Header:**
- Job code (prominent, e.g. "JOB-003")
- Job description (e.g. "South Reno Townhomes — Foundation Excavation")
- Location name if set (e.g. "📍 South Reno Staging Yard")

**Crew Section (from CrewAssignment where startDate ≤ today and endDate is null or ≥ today):**
- Section label: "Crew"
- List of assigned employees: `{firstName} {lastName}` + role badge (e.g. "Crew Lead", "Operator")

**Equipment Section (from DispatchEvent where startDate ≤ today and endDate is null or ≥ today):**
- Section label: "Equipment"
- List of dispatched equipment: `{make} {model} ({code})`
- Status badge next to each: Available (blue) / In Use (green) / Down (red)
- Operator name shown under each equipment item (from operatorId)

**Empty state:** If a job has no crew and no equipment, show a subtle "No resources assigned" message.

### Unassigned Equipment Section (below the job cards)

A row or panel labeled "Unassigned Equipment" showing all Equipment records with no active DispatchEvent for today. These are machines sitting in a yard.
- Same format: `{make} {model} ({code})` + status badge

---

## Data Requirements

All data already exists — no new tables or migrations needed. This is a pure frontend change.

**Queries needed (can be fetched in parallel):**
1. All `Job` records (with locationId)
2. All `Location` records (for resolving locationId)
3. All `CrewAssignment` records where `startDate ≤ today` and (`endDate IS NULL` or `endDate ≥ today`)
4. All `DispatchEvent` records where `startDate ≤ today` and (`endDate IS NULL` or `endDate ≥ today`)
5. All `Equipment` records (for status badges and unassigned list)
6. All `Employee` records (for resolving employeeId and operatorId)

**Active filter logic (client-side):**
```
isActive = startDate <= today && (endDate == null || endDate >= today)
```

---

## Realtime

Wire up `useRealtime` for: `Job`, `CrewAssignment`, `DispatchEvent`, `Equipment`.

When any of these change, the relevant card should update instantly — a new crew assignment flashes on the job card, dispatched equipment appears, status badge changes live.

---

## Styling

Follow the existing dark industrial theme (slate-900 bg, slate-800 cards, orange-500 accents, blue-500 secondary).

- Job card: `bg-slate-800 rounded-lg p-4 border border-slate-700`
- Card header: job code in `text-orange-400 font-bold`, description in `text-slate-200`
- Section labels ("Crew", "Equipment"): `text-slate-400 text-xs uppercase tracking-wide`
- Status badges: reuse existing `<StatusBadge>` component
- Unassigned section: subtle `border-t border-slate-700` separator, muted styling

---

## Files to Create/Update

| File | Change |
|---|---|
| `src/views/MagnetBoard.tsx` | New view |
| `src/components/Sidebar.tsx` | Add "Magnet Board" nav item (above Overview, or as first item) |
| `src/App.tsx` | Add route/case for MagnetBoard view |

---

## Instructions for Claude Code

1. Read `EQUIPMENT-TRACKING-PROJECT.md` for full project context
2. Read `DASHBOARD-V1-PRD.md` for design principles and styling guide
3. Read existing views (especially `DispatchSchedule.tsx`) to understand the data-fetching and realtime pattern
4. Build `MagnetBoard.tsx` following the layout spec above
5. Add to sidebar and App routing
6. `npm run build` to verify TypeScript
7. Commit and push

## Out of Scope (V1)
- Drag-and-drop resource reassignment
- Left-panel inventory sidebar
- Filtering by date range
- Print/export

## Validation

After implementation:
1. Open Magnet Board view
2. Should see JOB-003 card with Sarah Mendez (Crew Lead) and Komatsu PC210 (In Use, Sarah Mendez operator)
3. Should see JOB-002 card with Mike Torres as operator on CAT 320
4. Unassigned equipment section should show all equipment with no active dispatch
5. Run `snc dispatch schedule` for a new piece of equipment — it should flash onto the correct job card in real-time
