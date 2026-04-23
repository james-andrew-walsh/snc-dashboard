# CR-004: Report — Reorder Columns for Mobile Visibility (v2)

## Status
Draft — awaiting execution

## Requested By
James Andrew

## Date
2026-04-23

---

## Problem

On mobile, Status and Variance are still not visible on the first screen. The current column order is: Job | Foreman | Equipment | Status | Variance | Description | Sched | Billed | Actual

---

## Solution

Move the Equipment column to after Variance, so the most important columns appear first on mobile.

### New Column Order

**Before:** Job | Foreman | Equipment | Status | Variance | Description | Sched | Billed | Actual

**After:** Job | Foreman | Status | Variance | Equipment | Description | Sched | Billed | Actual

---

## Files to Modify
- `src/views/Report.tsx`

---

## Done When
- Column order matches the spec above
- Mobile view shows Status, Variance, and Equipment without horizontal scroll
- `npm run build` passes with zero errors
- Committed to GitHub
- **PRD.md Change Log updated** (see CR-TEMPLATE.md Done section)
