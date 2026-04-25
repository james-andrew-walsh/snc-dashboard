# CR-012: Comprehensive Reconciliation Display + Report View Overhaul

## Status
Draft — awaiting execution

## Requested By
James Walsh

## Date
2026-04-25

## Bundled Meeting Feature Requests
A3, A4, A6, A7, B1, B2, B3 from the April 23, 2026 meeting summary.

---

## Problem

The current reconciliation hides 883 out of 1,005 rows as "skipped" for April 24. The report view only shows rows with status ok/over/under/no-data, which means only 10 rows appear. This masks actionable findings:

- **Dispatched but never billed (17 rows):** Foreman may have forgotten to submit hours or billed under wrong job code. Currently hidden.
- **No JD Link (567 rows):** Non-Deere equipment. Cannot compute telematics variance, but dispatch vs. billed comparison is still valuable.
- **No HeavyJob job match (294 rows):** Yard/admin codes. Should appear for completeness.

Additionally, the report view is missing several features requested in the April 23 meeting: multi-select filters, variance thresholds, alt-code display, and notes display.

---

## Solution

Two-part change: (1) restructure reconciliation status taxonomy in the edge function, (2) overhaul the Report view with comprehensive display and new filtering/data features.

---

## Part 1: Edge Function — New Status Taxonomy

Modify `core/supabase/functions/run-reconciliation/index.ts` to replace the single "skipped" status with granular statuses:

| Current Status | New Status | Condition |
|---|---|---|
| `over` | `over` | Billed > Actual beyond threshold (unchanged) |
| `under` | `under` | Billed < Actual beyond threshold (unchanged) |
| `ok` | `ok` | \|Billed - Actual\| ≤ 0.5h (unchanged) |
| `idle` | `idle` | Billed > 0, Actual = 0 (unchanged) |
| `no-data` (no readings) | `no-telematics` | Has billed hours but no telematics readings |
| `skipped` + notes "no JD Link" | `dispatch-only` | Dispatched, may have billed hours, no telematics provider |
| `skipped` + notes "no HeavyJob billed hours" | `dispatched-not-billed` | Dispatched + has telematics, but no HCSS billed hours. **This is a finding.** |
| `skipped` + notes "no HeavyJob job match" | `no-job-match` | Job code has no HCSS equivalent (yard/admin codes like DOWN FOR REPAIRS, MUSTANG YARD) |
| `billed-not-dispatched` | `billed-not-dispatched` | On HCSS timecard but not on dispatch (unchanged) |

Also add to each `reconciliation_results` row:
- `alt_code` — already stored, just ensure it is populated (currently working)
- `dispatch_notes` — from `dispatch_jobs.daily_notes` for the job this equipment is assigned to
- `timecard_notes` — new field: extract from HCSS timecard detail if available (the timecard detail payload may contain notes; extract and store them)

### Timecard Notes Extraction (B3)

In `hcss.ts`, the `HcssTimecardDetail` interface and `getHcssTimecardDetail` function already fetch the full timecard payload. Check if the HCSS timecard detail response includes a `notes` or `comments` field at the timecard level or per-equipment level. If it does, extract and store in `reconciliation_results.timecard_notes`. If the HCSS API does not provide notes in the timecard detail endpoint, set `timecard_notes = null` and add a comment noting the field is reserved for future use.

### Dispatch Notes (B2)

The `dispatch_jobs` table already has a `daily_notes` column populated by `dispatch-extract`. When building reconciliation result rows, join through `job_id` to get the job's `daily_notes` and store as `dispatch_notes` on each reconciliation result row. This makes it available to the dashboard without an extra join.

**Database change needed:** Add two nullable text columns to `reconciliation_results`:
- `dispatch_notes TEXT`
- `timecard_notes TEXT`

This requires a Supabase migration. Create a new migration file `core/supabase/migrations/XXX_add_notes_columns.sql` (use next sequential number) with:
```sql
ALTER TABLE reconciliation_results ADD COLUMN IF NOT EXISTS dispatch_notes TEXT;
ALTER TABLE reconciliation_results ADD COLUMN IF NOT EXISTS timecard_notes TEXT;
```

Then apply it via the Supabase dashboard SQL editor or `supabase db push`.

---

## Part 2: Dashboard Report View Overhaul

### 2a. Show ALL rows by default

Currently in `Report.tsx` lines 93-94, the `rows` memo filters to only `ok | over | under | no-data`:
```ts
.filter(e => e.status === 'ok' || e.status === 'over' || e.status === 'under' || e.status === 'no-data')
```
**Remove this filter.** All rows should be included. The status filter UI handles what the user wants to see.

### 2b. Update `ReconStatus` type (types.ts)

Replace:
```ts
export type ReconStatus = 'ok' | 'over' | 'under' | 'no-data' | 'skipped' | 'billed-not-dispatched' | 'unknown'
```
With:
```ts
export type ReconStatus =
  | 'ok' | 'over' | 'under' | 'idle'
  | 'no-telematics' | 'dispatch-only' | 'dispatched-not-billed'
  | 'no-job-match' | 'billed-not-dispatched' | 'unknown'
```

### 2c. Update `DashboardSummary` type and `computeSummary` (types.ts + adapter.ts)

Expand `DashboardSummary` to count all new statuses:
```ts
export interface DashboardSummary {
  total: number
  over: number
  under: number
  ok: number
  idle: number
  no_telematics: number
  dispatch_only: number
  dispatched_not_billed: number
  no_job_match: number
  billed_not_dispatched: number
}
```

Update `computeSummary` in `adapter.ts` to count each status.

### 2d. Status filter — multi-select toggles (replaces current single-select)

Replace the current `StatusFilter = 'all' | 'over' | 'under' | 'ok'` with a `Set<string>` of active statuses. Default: all statuses enabled. Clicking a status chip toggles it on/off. Clicking "All" resets to all enabled.

Status chips with colors:
- `over` → red
- `under` → blue  
- `ok` → green
- `idle` → orange
- `no-telematics` → gray
- `dispatch-only` → light gray / white border
- `dispatched-not-billed` → amber/yellow (visually prominent — this is a finding)
- `no-job-match` → dim/muted
- `billed-not-dispatched` → purple

### 2e. Job filter — checkbox multi-select dropdown (A3)

Replace the current single-select `<select>` job dropdown with a checkbox multi-select dropdown. User can select multiple jobs. "All jobs" checkbox at top selects/deselects all.

Implementation: a custom dropdown component (no external dependency) with:
- Search/filter input at top
- "Select All" / "Clear" buttons  
- Scrollable checkbox list of jobs (show `job_code — job_name`)
- Selected count badge on the dropdown trigger

### 2f. Foreman filter — checkbox multi-select dropdown (A4)

Same pattern as job filter. Dropdown with checkboxes for each foreman. Show `foreman_name (foreman_code)`. The foreman list should be derived from the current data (not a separate API call).

### 2g. Variance threshold filter (A6 + A7)

Add a numeric input (or slider) labeled "Min variance (h)" that filters to only show rows where `|variance| >= threshold`. Default: 0 (show all). This sits in the filter bar alongside the status and job filters.

### 2h. Alt-code display (B1)

Add an `alt_code` column to the table, positioned after `equipment_code`. The `ReconciliationResult` type already has `alt_code` as a field (though it may be stored under a different key — verify). Display format: `LD 7707` or `EX 9833`.

If `alt_code` is null, show "—".

### 2i. Notes columns (B2 + B3)

Add expandable notes to each row. Two approaches (choose the simpler one):

**Option A (preferred): Expandable row detail.** Clicking a row expands it to show dispatch notes and timecard notes below the main columns. This keeps the table clean.

**Option B: Dedicated columns.** Add `Dispatch Notes` and `Timecard Notes` columns. These may be wide, so truncate with `max-w-[200px] truncate` and show full text on hover/title.

### 2j. Summary cards update

Replace the current 5 summary cards (Total, Over, Under, OK, Net Variance) with a more comprehensive set. Group into two rows if needed:

Row 1 (actionable): Over, Under, OK, Idle, Dispatched-Not-Billed
Row 2 (informational): Dispatch-Only, No Telematics, No Job Match, Billed-Not-Dispatched, Net Variance

Each card is clickable to toggle the corresponding status filter.

### 2k. Column: show `alt_code` in Equipment column

Instead of a separate column, consider showing alt_code inline: `7707` with `LD 7707` as a subtitle or badge. This saves horizontal space. Use whichever approach looks cleaner.

---

## Files to Modify

### Edge Function
- `core/supabase/functions/run-reconciliation/index.ts` — New status taxonomy, populate `dispatch_notes` and `timecard_notes`
- `core/supabase/functions/run-reconciliation/hcss.ts` — Extract timecard notes if available in API response

### Database
- New migration: `core/supabase/migrations/XXX_add_notes_columns.sql` — Add `dispatch_notes` and `timecard_notes` to `reconciliation_results`

### Dashboard
- `src/lib/types.ts` — Update `ReconStatus`, `DashboardSummary`, add `alt_code`/`dispatch_notes`/`timecard_notes` to `ReconciliationResult`
- `src/data/adapter.ts` — Update `computeSummary`, ensure `fetchSnapshot` pulls new columns
- `src/views/Report.tsx` — Major overhaul: remove skipped filter, new multi-select status/job/foreman filters, variance threshold, alt-code display, notes display, updated summary cards, new status chip colors

### Possibly
- `src/views/MagnetBoard.tsx` — Show all equipment per job with status badges (same principle as report). This is secondary; prioritize Report view.

---

## Acceptance Criteria

1. Running reconciliation for Apr 24 produces rows with the new status taxonomy (no more generic "skipped")
2. `dispatched-not-billed` rows are visually prominent (amber)
3. Report view shows ALL rows by default (~893 for Apr 24, ~872 for Apr 17)
4. Multi-select checkbox dropdowns work for both jobs and foremen
5. Variance threshold filter works (e.g., set to 3h shows only rows with |variance| ≥ 3h)
6. Alt-code is visible on each row
7. Dispatch notes are visible (expandable or column)
8. Summary cards show counts for all status categories
9. Status filter chips toggle individual statuses on/off
10. Apr 17 reconciliation still produces correct over/under/ok/idle results (regression check)
11. CSV export includes all new columns and statuses
12. Build passes cleanly (`npm run build`)

---

## Deployment Steps

1. Apply database migration (add notes columns)
2. Deploy updated `run-reconciliation` edge function
3. Re-run reconciliation for Apr 17 and Apr 24 to populate new statuses
4. Deploy updated dashboard
5. Verify both dates display correctly
