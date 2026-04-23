# CR-002: Magnet Board — Mobile Touch Swipe Support

## Status
Draft — awaiting execution

## Requested By
James Andrew

## Date
2026-04-23

---

## Problem

The Magnet Board slider navigation works on desktop (prev/next buttons, range slider, keyboard arrows) but has no touch-based swipe navigation on mobile. Users on phones cannot slide left/right to see all 23 jobs.

---

## Solution

Add **touch swipe support** so users can swipe left/right on their phone to navigate between job columns, in addition to the existing slider controls.

### Requirements

1. **Swipe gestures**: Detect horizontal swipe left/right on the board container using `touchstart` / `touchmove` / `touchend` events (or a library like `@use-gesture/react` if already installed — check first)
2. **Momentum / threshold**: Swipe must feel natural — minimum swipe distance (e.g. 50px) to trigger a slide, with smooth slide animation following the existing 300ms ease-out
3. **Keep existing controls**: The prev/next buttons, range slider, and keyboard arrows must continue to work
4. **Responsive column sizing**: On mobile, columns should be sized appropriately so 1–2 columns are visible at a time (not 6 like desktop)

### UX Flow
1. User on phone opens Magnet Board
2. Sees 1–2 job columns (mobile-optimized)
3. Swipes left → board slides to next column group with smooth animation
4. Swipes right → board slides back

---

## Technical Approach

- Use native touch event handlers on the board container (`onTouchStart`, `onTouchMove`, `onTouchEnd`) — no external library needed
- Track `touchStartX` and `touchEndX`, compute delta
- If `Math.abs(deltaX) > 50` (swipe threshold), step left or right accordingly
- Prevent default browser scroll behavior during swipe on the board area only
- Ensure `user-select: none` on the board so text doesn't get selected during swipe

---

## Files to Modify
- `src/views/MagnetBoard.tsx` — add touch event handlers and mobile column sizing

---

## Done When
- Swipe left/right works on mobile Chrome/Safari
- Existing desktop controls (buttons, slider, keyboard) still work
- `npm run build` passes with zero errors
- Committed to GitHub
