# CR-001: Magnet Board — Horizontal Slider Navigation

## Status
Draft — awaiting execution

## Requested By
James Andrew

## Date
2026-04-23

---

## Problem

The Magnet Board currently shows 6 job columns and has no mechanism to navigate to the remaining jobs. With 23 jobs in the April 17 reconciliation, users can only see the first 6.

---

## Solution

Add a **horizontal slider** at the bottom of the board that lets users slide between all job columns, with a smooth animated transition that mimics sliding a physical magnet board.

### Requirements

1. **Slider control** at the bottom of the board:
   - Shows current position (e.g., "1 / 23" or a visual progress indicator)
   - Drag handle or click-to-navigate
   - Shows all 23 jobs with a scrubber/progress bar

2. **Smooth sliding animation**:
   - When the user moves the slider, columns animate horizontally (CSS transform or scroll)
   - Duration: ~300ms ease-out
   - Feels physical, like sliding magnets on a steel board

3. **Virtualization**:
   - Only render the visible columns + 1 buffer on each side
   - This keeps DOM lightweight regardless of total job count

4. **Keyboard / swipe support** (nice to have):
   - Arrow keys to step left/right
   - If on a touch device, swipe left/right

### UX Flow
1. User sees columns 1–6 initially (first 6 jobs)
2. Slider at bottom shows position 1, total 23
3. User drags slider or clicks ahead — board slides smoothly to show columns 7–12 (jobs 7–12)
4. Continue through all 23 jobs

---

## Technical Approach

- Use a horizontally-scrolling container with `overflow: hidden` and CSS `transform: translateX()` animated by JS
- Use a slider component (native `<input type="range">` styled, or custom) bound to the scroll position
- Virtualization: render only columns `currentIndex` through `currentIndex + visibleCount + 1`
- Store `currentIndex` in React state

---

## Files to Modify
- `src/views/MagnetBoard.tsx` — main board component
- `src/index.css` — add transition/animation styles if needed

---

## Done When
- All 23 jobs are navigable via the slider
- Smooth sliding animation between column groups
- `npm run build` passes with zero errors
- Deployed / committed to GitHub
