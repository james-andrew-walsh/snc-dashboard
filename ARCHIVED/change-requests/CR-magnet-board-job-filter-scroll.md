# CR-005: Magnet Board — Job Filter Dropdown Scrollable

## Status
Draft — awaiting execution

## Requested By
James Andrew

## Date
2026-04-23

---

## Problem

The Magnet Board's job filter at the top shows a dropdown with job IDs, but it appears to only show a few jobs without scrollable access to the remaining 23 jobs. Users cannot filter to a specific job.

---

## Solution

Make the job filter dropdown fully scrollable so all 23 jobs are accessible.

### Requirements

1. The job filter dropdown/select should display all available jobs
2. The dropdown should have a max-height and be scrollable (standard `<select>` or custom dropdown with `overflow-y: auto`)
3. Jobs should be listed with both job code and job name for easy identification
4. "All Jobs" option should remain at the top

---

## Files to Modify
- `src/views/MagnetBoard.tsx`

---

## Done When
- All 23 jobs appear in the job filter dropdown, scrollable
- Job code + name shown in each option
- `npm run build` passes with zero errors
- Committed to GitHub
- **PRD.md Change Log updated**
