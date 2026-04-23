# CR-008: Magnet Board — Remove AI Summary Panel

## Status
Draft — awaiting execution

## Requested By
James Andrew

## Date
2026-04-23

---

## Problem

The Magnet Board has an "AI Summary" panel/toggle that James does not want. Remove it entirely for now.

---

## Solution

Remove all AI Summary panel code from MagnetBoard.tsx.

### Requirements

1. Remove the AI Summary panel section from the UI
2. Remove any "Tweaks" panel if it exists
3. Remove any toggle/button that shows/hides the AI Summary panel
4. Keep everything else — the board, slider, job filter, equipment detail panel, chart — completely intact

---

## Files to Modify
- `src/views/MagnetBoard.tsx`

---

## Done When
- No AI Summary panel or toggle appears anywhere in the Magnet Board
- All other functionality (board, slider, job filter, equipment detail, chart modes) works exactly as before
- `npm run build` passes with zero errors
- Committed to GitHub
- **PRD.md Change Log updated**
