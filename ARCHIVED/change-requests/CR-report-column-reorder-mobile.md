# CR-003: Report — Reorder Columns for Mobile Visibility

## Status
Draft — awaiting execution

## Requested By
James Andrew

## Date
2026-04-23

---

## Problem

On mobile, the Report table's most important columns — Status and Variance — are pushed off-screen to the right because they appear late in the column order. Users on phone can't see them without horizontal scrolling.

---

## Solution

Reorder the table columns so **Status** and **Variance** appear immediately before the **Description** column, instead of at the end.

### New Column Order

**Before:** Job | Foreman | Equipment | Description | Sched | Billed | Actual | Variance | Status

**After:** Job | Foreman | Equipment | **Status** | **Variance** | Description | Sched | Billed | Actual

---

## Files to Modify
- `src/views/Report.tsx`

---

## Done When
- Column order matches the spec above
- Mobile view shows Status and Variance without horizontal scroll
- `npm run build` passes with zero errors
- Committed to GitHub
- **PRD.md Change Log updated** (see CR-TEMPLATE.md Done section)
