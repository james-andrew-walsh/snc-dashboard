# CR-006: Magnet Board — Equipment Detail Panel Uses Live 24-Hour Telematics Data

## Status
Draft — awaiting execution

## Requested By
James Andrew

## Date
2026-04-23

---

## Problem

When a user taps a piece of equipment on the Magnet Board, the detail panel shows a chart. Currently it appears to show mock/dummy 7-day data. The panel should instead show **actual telematics readings from the selected 24-hour report period**.

---

## Solution

Replace the mock chart in the equipment detail panel with a **24-hour line chart** driven by real `TelematicsSnapshot` data for the selected equipment and report date.

### Requirements

1. **Data source**: Query `TelematicsSnapshot` for the selected `equipment_code` within the report date range (April 17 00:00–23:59 local time)
2. **Chart type**: Line chart showing hour meter readings over 24 hours
3. **X-axis**: Hours 0–23 for the report date (local time, PDT)
4. **Y-axis**: Hour meter reading (cumulative engine hours)
5. **Data points**: One point per reading in `TelematicsSnapshot`, plotted at their local timestamp
6. **No mock data**: Remove any deterministic/random fallback data — if no telematics exist for that equipment, show a message like "No telematics data for this equipment on this date"
7. **Responsive**: Chart should fill the detail panel width and resize appropriately

### Implementation Notes

- The `TelematicsSnapshot` table already has: `equipmentCode`, `snapshotAt` (UTC), `hourMeterReadingInHours`
- Convert UTC timestamps to PDT (local time) for display
- Use the existing chart library already in the project (check imports in MagnetBoard.tsx)
- The report date is available in the component state

---

## Files to Modify
- `src/views/MagnetBoard.tsx`

---

## Done When
- Detail panel shows a 24-hour line chart with real telematics data when available
- Empty state shown when no telematics data exists for the selected equipment
- No mock or random data used
- `npm run build` passes with zero errors
- Committed to GitHub
- **PRD.md Change Log updated**
