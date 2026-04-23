# CR-007: Magnet Board — Equipment Detail Chart: Swipe to Toggle Line ↔ Bar Histogram

## Status
Draft — awaiting execution

## Requested By
James Andrew

## Date
2026-04-23

---

## Problem

The equipment detail panel shows a line chart. Users want the ability to switch between a **line chart** and a **bar chart/histogram** to visualize the same 24-hour telematics data differently.

---

## Solution

Add swipe-left/right gesture on the chart in the detail panel to cycle between two chart modes. Persist the user's preferred mode globally so it applies to all equipment cards until changed.

### Requirements

1. **Two chart modes**:
   - **Line chart** (current): Hour meter reading over 24 hours
   - **Bar histogram** (new): 24 bars — each bar shows hours run during that hour (delta between consecutive hour meter readings, i.e. `reading[t] - reading[t-1]`, capped at 0 for negative deltas which indicate meter rollovers)

2. **Swipe to toggle**:
   - Swipe left or right on the chart area to switch between line and bar mode
   - Use same touch gesture detection as the board navigation (50px threshold, horizontal-only)
   - Animate the transition (fade or slide)

3. **Persistent preference**:
   - Store the current chart mode in React state at the board level (not per-card)
   - When user opens a different equipment card, remember the last chosen mode
   - Default to line chart on first load

4. **Chart labels**:
   - Line chart: "24-Hour Hour Meter" as title
   - Bar histogram: "Hours Run Per Hour" as title
   - X-axis: hours 0–23
   - Y-axis: hours (0 to max)

---

## Files to Modify
- `src/views/MagnetBoard.tsx`

---

## Done When
- Swipe left/right on chart toggles between line and bar mode
- Bar chart shows 24 bars with delta hours per hour
- Chart mode persists across equipment card opens
- `npm run build` passes with zero errors
- Committed to GitHub
- **PRD.md Change Log updated**
