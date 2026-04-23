# PRD — SNC Equipment Reconciliation Dashboard v2

**Product:** SNC Equipment Reconciliation — web dashboard and reconciliation engine
**Version:** 2.0
**Date:** 2026-04-23
**Status:** Draft — in review

---

## 1. Context and Background

### Where We Are

The existing `snc-dashboard` (`snc-dashboard.vercel.app`) was built as an exploration vehicle for the HCSS API surface. It contains views (Business Units, Jobs, Equipment, Employees, Map, etc.) that were correct for understanding the data model, but are not part of the reconciliation workflow. The current dashboard is built on a schema that mirrors HCSS — `BusinessUnit`, `Equipment`, `Job`, `Location`, `Employee`, `DispatchEvent`, `CrewAssignment` — which was the right starting point for exploration but is the wrong foundation for the production workflow.

The `reconcile.py` script (built 2026-04-21) proves the reconciliation workflow end-to-end. It reads from LlamaParse dispatch exports and JDLink engine hours, and produces a text audit trail. It runs without Supabase. It is the canonical reference implementation for the reconciliation algorithm.

### Where We're Going

Supabase becomes the persistence layer for the reconciliation workflow — not a mirror of HCSS, but a model of the business process. The LlamaParse output is parsed once and written to Supabase as structured records. The reconciliation engine reads from Supabase, runs the comparison, and writes results back to Supabase. Both the Report view and the Magnet Board view read from those results.

The existing dashboard is rebuilt: keep the authentication shell, replace every view, replace every table.

### What We're Keeping From the Existing Setup

The following Supabase infrastructure is already correct and must be preserved:
- **Auth:** Supabase email/password authentication
- **RLS:** Row-level security enabled on all tables
- **user_profiles:** `id`, `email`, `role`, `displayName`, `permissions` JSONB, `createdAt`, `updatedAt`
- **Existing user accounts:** james@amplifyluxury.com (admin), agent-write@snc.app, agent-read@snc.app
- **Supabase URL and anon key** — unchanged, same project (`ghscnwwatguzmeuabspd`)
- **Vercel project** — `snc-dashboard.vercel.app`, connected to GitHub

The following are deleted and replaced:
- All HCSS-mirror tables: `BusinessUnit`, `Equipment`, `Job`, `Location`, `Employee`, `DispatchEvent`, `CrewAssignment`
- All existing dashboard views (Overview, Business Units, Jobs, Equipment, Employees, Dispatch Schedule, Crew Assignments, Admin)
- The `snc` CLI (refactored separately; out of scope for this PRD)

---

## 2. Product Overview

### Two Views

1. **Reconciliation Report** — the primary view. For a selected date, shows every job's reconciliation outcome: equipment that was dispatched, what HeavyJob says was billed, what JDLink says actually ran, and the variance. Flagged items are highlighted. This is the audit document.

2. **Magnet Board** — the same data, presented in the visual language of the physical SNC dispatch board. Color-coded magnets by role (Foreman=red, Operator=yellow, Laborer=green, Equipment=blue), job columns, Sched/Billed/Ran metric strips. This is the operational view for daily use.

Both views read from the same underlying reconciliation results stored in Supabase.

### Data Flow

```
LlamaParse dispatch PDF
         ↓
  extract_dispatch.py
         ↓
  Structured JSON (dispatch-schema.json)
         ↓
  Supabase Edge Function: dispatch_ingest
  ─────────────────────────────────────
  Writes to:
    dispatch_reports
    dispatch_jobs
    dispatch_foremen
    dispatch_operators
    dispatch_laborers
    dispatch_equipment_assignments
    telematics_readings  (raw JDLink readings, one row per reading)
         ↓
  Supabase Edge Function: run_reconciliation
  ──────────────────────────────────────────
  Reads: dispatch_equipment_assignments, telematics_readings, HeavyJob API
  Writes: reconciliation_results
         ↓
  ┌─────┴─────┐
  ↓           ↓
Report    Magnet Board
View      View
```

The two views are clients of the same data. Neither view calls JDLink or HeavyJob directly.

---

## 3. Supabase Schema

### Old Tables — Deleted

The following tables are dropped via a cleanup migration before the new schema is applied:

- `BusinessUnit`
- `Equipment`
- `Job`
- `Location`
- `Employee`
- `DispatchEvent`
- `CrewAssignment`

RLS policies and triggers associated with these tables are also deleted.

### New Tables

All new tables use `id` (UUID, primary key), `createdAt`, and `updatedAt` as standard columns.

---

#### `dispatch_reports`

One row per LlamaParse dispatch report processed.

| Column | Type | Notes |
|--------|------|-------|
| `report_date` | date | The date of the dispatch (not the processing date) |
| `source_file` | text | Original LlamaParse filename, e.g. `APR 17TH_llamaparse.md` |
| `status` | text | `pending`, `ingested`, `reconciled`, `error` |
| `notes` | text | Any processing notes or errors |

**Unique constraint:** `(report_date)` — one report per date.

---

#### `dispatch_jobs`

One row per job appearing in a dispatch report.

| Column | Type | Notes |
|--------|------|-------|
| `report_id` | UUID | FK → `dispatch_reports.id` |
| `job_code` | text | Short code, e.g. `11788` |
| `job_name` | text | Full name, e.g. `RTC - 6TH, 7TH AND WEST STREETS REHAB` |
| `location` | text | Street address (from dispatch) |
| `contact` | text | Primary contact name(s) |
| `daily_notes` | text | Day's notes from dispatch |

---

#### `dispatch_foremen`

One row per foreman appearing in a dispatch report.

| Column | Type | Notes |
|--------|------|-------|
| `report_id` | UUID | FK → `dispatch_reports.id` |
| `job_id` | UUID | FK → `dispatch_jobs.id` |
| `foreman_code` | text | HCSS foreman code, e.g. `MORJOH` |
| `foreman_name` | text | Full name, e.g. `MORRIS, ANTHONY L` |
| `timecard_id` | UUID | FK → HeavyJob timecard UUID (populated after reconciliation) |

---

#### `dispatch_operators`

One row per operator assignment.

| Column | Type | Notes |
|--------|------|-------|
| `report_id` | UUID | FK → `dispatch_reports.id` |
| `job_id` | UUID | FK → `dispatch_jobs.id` |
| `operator_code` | text | Short code, e.g. `LABR00` |
| `operator_name` | text | Full name |
| `union_local` | text | e.g. `L169`, `L3` |
| `equipment_code` | text | Assigned equipment code |

---

#### `dispatch_laborers`

One row per laborer assignment. Schema mirrors `dispatch_operators` except `union_local` only.

---

#### `dispatch_equipment_assignments`

One row per equipment assignment on the dispatch — the core input to reconciliation.

| Column | Type | Notes |
|--------|------|-------|
| `report_id` | UUID | FK → `dispatch_reports.id` |
| `job_id` | UUID | FK → `dispatch_jobs.id` |
| `foreman_code` | text | FK → `dispatch_foremen.foreman_code` |
| `equipment_code` | text | Equipment short code, e.g. `7707` |
| `description` | text | Full description, e.g. `20 JD 544L WHEEL LOADER` |
| `kind` | text | Equipment kind: `TRUCK`, `LOADER`, `EXCAVATOR`, `RENTAL`, `TRAILER`, `ROLLER`, `MISC` |
| `provider` | text | Telematics provider: `JDLink`, `VisionLink`, `e360`, `MyKomatsu`, or `null` |
| `sched_start` | timestamptz | Shift start, parsed from dispatch, stored as UTC |
| `sched_end` | timestamptz | Shift end, parsed from dispatch, stored as UTC |
| `sched_hours` | float | Decimal scheduled hours |

---

#### `telematics_readings`

One row per raw telematics reading from JDLink. Written by `dispatch_ingest`, read by `run_reconciliation`.

| Column | Type | Notes |
|--------|------|-------|
| `report_id` | UUID | FK → `dispatch_reports.id` |
| `equipment_code` | text | Equipment short code |
| `provider` | text | `JDLink` (extendable to other providers) |
| `reading_time` | timestamptz | UTC timestamp of the reading |
| `hour_meter_value` | float | Cumulative engine hours at reading time |

**Index:** `(equipment_code, reading_time)` for fast range queries.

---

#### `reconciliation_results`

One row per equipment item per foreman timecard per report date. Written by `run_reconciliation`.

| Column | Type | Notes |
|--------|------|-------|
| `report_id` | UUID | FK → `dispatch_reports.id` |
| `job_id` | UUID | FK → `dispatch_jobs.id` |
| `foreman_code` | text | |
| `equipment_code` | text | |
| `description` | text | |
| `kind` | text | Equipment kind |
| `provider` | text | Telematics provider or `NO TLMTRY` |
| `sched_hours` | float | From dispatch |
| `billed_hours` | float | From HeavyJob timecard |
| `actual_hours` | float | From JDLink telematics |
| `variance` | float | `billed_hours - actual_hours` |
| `status` | text | `ok`, `over`, `under`, `no-data` |
| `reading_count` | int | Number of JDLink readings used |
| `notes` | text | e.g. `SKIPPED — no JD Link`, `BILLED NOT DISPATCHED` |

**Derived at read time (not stored):** `status` classification based on `|variance| <= tolerance`.

---

### RLS Policies

All new tables have RLS enabled. Policies:

- **Authenticated users** can read all tables (`SELECT` for all authenticated).
- **Admin role** (`james@amplifyluxury.com`) can `INSERT`, `UPDATE`, `DELETE` all tables.
- **Agent write role** (`agent-write@snc.app`) can `INSERT` and `UPDATE` on all tables — used by edge functions.
- **Agent read role** (`agent-read@snc.app`) can `SELECT` all tables.

The existing `user_profiles` table and auth infrastructure is unchanged.

---

## 4. Edge Functions

### `dispatch_ingest`

**Trigger:** HTTP POST from the `snc` CLI or a manual "ingest dispatch" button in the dashboard.

**Input:** LlamaParse markdown filename (e.g., `APR 17TH_llamaparse.md`)

**Process:**
1. Read the LlamaParse markdown file from local disk (`../references/APR 17TH_llamaparse.md`)
2. Run `extract_dispatch_llamaparse.py` to produce structured JSON matching `dispatch-schema.json`
3. Write one row to `dispatch_reports`
4. Write rows to `dispatch_jobs`, `dispatch_foremen`, `dispatch_operators`, `dispatch_laborers`, `dispatch_equipment_assignments`
5. Write raw JDLink readings to `telematics_readings` (for the report date, fetched from JDLink engine hours API)
6. Mark `dispatch_reports.status = 'ingested'`

**Auth:** Called by `agent-write@snc.app` service account.

---

### `run_reconciliation`

**Trigger:** HTTP POST with `report_date` (YYYY-MM-DD). Also callable from dashboard UI.

**Process:**
1. Read `dispatch_reports` for the date (must have `status = 'ingested'`)
2. For each job in `dispatch_jobs`:
   a. Look up HeavyJob job UUID from job code
   b. Fetch HeavyJob timecards for that job + date
   c. For each timecard:
      - Resolve foreman
      - Fetch timecard detail (equipment + hours)
      - For each equipment on the timecard that has a dispatch assignment:
        - Fetch actual hours from `telematics_readings` (filter by equipment_code, date range)
        - Compute variance
        - Write `reconciliation_results` row
      - Flag equipment on timecard not in dispatch: write `reconciliation_results` with `notes = 'BILLED NOT DISPATCHED'`
3. Mark `dispatch_reports.status = 'reconciled'`

**Auth:** Called by `agent-write@snc.app`. Dashboard UI shows "Run Reconciliation" button only to admin users.

---

### `get_reconciliation_report`

**Trigger:** HTTP GET with `report_date` query param.

**Process:**
1. Query `reconciliation_results` joined with `dispatch_jobs` for the date
2. Return structured JSON (or render as HTML server-side)

**Auth:** Any authenticated user.

---

## 5. Views

### 5.1 Reconciliation Report View

**Route:** `/report`

**Purpose:** The audit document. Shows the complete reconciliation outcome for a selected date, job by job, foreman by foreman, equipment by equipment.

**Layout:**
- Date picker (top bar, date input)
- Status banner: `Pending` / `Ingested` / `Reconciled` for the selected date
- "Ingest Dispatch" button (triggers `dispatch_ingest`)
- "Run Reconciliation" button (triggers `run_reconciliation`) — admin only
- For each job:
  - Job header: code + name
  - For each foreman:
    - Foreman header
    - Table of equipment: Code | Description | Sched | Billed | Actual | Variance | Status
    - Flagged rows highlighted (red left border)
    - Summary line per foreman: total flagged / passed / no-data

**Data source:** `reconciliation_results` table via `get_reconciliation_report` edge function.

---

### 5.2 Magnet Board View

**Route:** `/board`

The Magnet Board view is implemented exactly as described in **PRD — SNC Equipment Tracking Magnet Board (Front-End, Phase 1)** (`references/PRD - Claude Design Magnet Board Phase 1.md`), with the following modifications:

**What carries over from the Phase 1 PRD:**
- All visual design: colors, fonts (Caveat handwritten headers, JetBrains Mono for codes/numbers, Inter for UI)
- All CSS custom properties and design tokens
- Magnet anatomy and color coding (red/yellow/green/blue headers)
- Equipment metric strip (Sched / Billed / Ran)
- Variance row and tolerance logic
- Side detail panel with 7-day trend chart
- AI Summary panel
- Filter chips (job / role / status)
- Tweaks panel (variance tolerance slider)
- Responsive behavior (≥1024px / 760–1023px / <760px breakpoints)
- All interaction spec: hover states, flag pulse animation, panel transitions, swipeable carousel

**What changes from Phase 1:**
- `adapter.js` reads from `reconciliation_results` table (Supabase) instead of `mock.js`
- No longer reads from HCSS or any external API at render time — data is pre-computed by `run_reconciliation`
- Date navigation changes the `report_date` query param; component re-fetches `reconciliation_results` for the new date
- The 7-day trend chart reads from `telematics_readings` (raw readings, aggregated client-side) or from a dedicated `equipment_history` aggregate table
- AI Summary panel calls a dedicated edge function (`get_ai_summary`) rather than running inference client-side

**What is dropped from Phase 1:**
- The mock data module (`mock.js`) is deleted
- The "Phase 2 Preview" section of the PRD is now the actual implementation

**Data adapter signature (updated):**
```js
// adapter.js — reads from Supabase via edge function
getJobs(date): Job[]
getCrewForJob(jobId, date): { foremen, operators, laborers }
getEquipmentForJob(jobId, date, opts?: { flagFilter, hideOk, tolerance }): Equipment[]
getReconciliationResult(equipmentCode, date): ReconciliationResult
getTelematicsHistory(equipmentCode, days = 7): HistoryPoint[]
```

**Shared components (from Phase 1 PRD, carried forward unchanged):**
- `TopBar` — brand, date picker, filter chips, AI toggle, alerts badge
- `Board` — horizontal grid, job columns, whiteboard background
- `MagnetCard` — all four variants (foreman/operator/laborer/equipment)
- `SidePanel` — detail view with reconciliation metrics, source info, 7-day chart
- `AISummaryPanel` — floating card with clickable findings
- `TweaksPanel` — floating controls with close button
- `MobileBottomBar` — Board / Filters / AI entry points
- `FilterSheet` — bottom sheet for mobile filters

---

## 6. Authentication and Authorization

### Preserved From Existing Setup

- **Supabase Auth:** Email/password, same three accounts
- **user_profiles table:** unchanged schema, unchanged data
- **RLS:** re-applied to new tables with the same policy structure
- **Permissions system:** JSONB `permissions` column on `user_profiles`, `can_perform()` function

### Dashboard Auth Flow

Unchanged from existing dashboard:
1. User visits `/login` → enters email/password
2. Supabase Auth returns JWT stored in session
3. All API calls include JWT in `Authorization: Bearer <token>` header
4. Edge functions validate JWT and enforce RLS

### Role Permissions for New Views

| Action | admin | dispatcher | read_only | agent_write | agent_read |
|--------|-------|-----------|---------|------------|------------|
| View Report | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Magnet Board | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ingest Dispatch | ✅ | ✅ | ❌ | ✅ | ❌ |
| Run Reconciliation | ✅ | ❌ | ❌ | ✅ | ❌ |
| Update Tweaks | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## 7. Routing and Navigation

**Routes:**
- `/` → redirect to `/report`
- `/login` → login page (unchanged)
- `/report` → Reconciliation Report view
- `/board` → Magnet Board view
- `/admin` → User management (existing page, unchanged)

**Navigation:** Sidebar with links to Report and Board only. All other sidebar items removed.

---

## 8. Non-Goals

- **No map view** in v2. The Mapbox geofencing view from the original dashboard is not part of the reconciliation workflow and is dropped.
- **No real-time telematics** in v2. Telematics readings are fetched at ingest time and stored in `telematics_readings`. The board does not receive live updates.
- **No drag-and-drop.** The magnet board is read-only.
- **No multi-user sync.** Single user session only.
- **No PDF export.** Report view is HTML only.
- **No HCSS mirror.** The new schema does not model HCSS entities — it models the reconciliation workflow only.

---

## 9. Open Questions

- **Q1.** Do we need a `dispatch_operators` and `dispatch_laborers` table, or is personnel display purely cosmetic (read from `dispatch_equipment_assignments` role field)? The Phase 1 PRD treats personnel as magnets with names from the dispatch. Current `reconcile.py` does not process operators/laborers at all.
- **Q2.** Should `telematics_readings` store readings from all providers (JDLink, VisionLink, e360, MyKomatsu), or only JDLink for now? The schema is provider-agnostic, but ingest is JDLink-only initially.
- **Q3.** Should the 7-day trend chart read from `telematics_readings` (raw rows, aggregated client-side) or from a pre-aggregated `equipment_daily_summary` table? Raw is simpler to implement; pre-aggregated is faster to query.
- **Q4.** Does the Report view need a printable/exportable mode, or is HTML-on-screen sufficient for the meeting demo?
- **Q5.** What is the deployment workflow for edge functions? Are they deployed from the `snc-dashboard` repo, or a separate repo?

---

## 10. Relationship to Existing Artifacts

| Artifact | Status |
|----------|--------|
| `EQUIPMENT-TRACKING-PROJECT.md` | Superseded by this PRD for dashboard work. Kept for CLI and backend context. |
| `PRD-reconcile.md` | Reference for reconciliation algorithm. `run_reconciliation` edge function implements it. |
| `RECONCILIATION-WORKFLOW.md` | Reference for operational narrative. |
| `references/PRD - Claude Design Magnet Board Phase 1.md` | **Incorporated in full** as Section 5.2 of this PRD. |
| `scripts/reconcile.py` | Reference implementation of reconciliation algorithm. Not deployed — algorithm re-implemented in `run_reconciliation` edge function. |
| `scripts/extract_dispatch_llamaparse.py` | In use. Called by `dispatch_ingest`. |

---

## 11. Acceptance Criteria

### Dispatch Ingest
- [ ] `dispatch_ingest` writes all rows correctly to Supabase for a known dispatch date
- [ ] `dispatch_reports.status` transitions: `pending` → `ingested`
- [ ] `telematics_readings` contains raw JDLink readings for the report date
- [ ] Errors are surfaced clearly if the LlamaParse file is missing or malformed

### Reconciliation Engine
- [ ] `run_reconciliation` produces one `reconciliation_results` row per equipment item per foreman timecard
- [ ] Variance is computed correctly: `billed_hours - actual_hours`
- [ ] Status classification follows tolerance: `|variance| <= 0.5` → `ok`, else `over` or `under`
- [ ] Equipment on timecard but not on dispatch is flagged as `BILLED NOT DISPATCHED`
- [ ] Equipment on dispatch but not on timecard is flagged appropriately
- [ ] `dispatch_reports.status` transitions: `ingested` → `reconciled`

### Report View
- [ ] Shows all jobs for the selected date
- [ ] Shows all foremen per job
- [ ] Shows all equipment with Sched / Billed / Actual / Variance / Status
- [ ] Flagged rows are visually distinct (red border)
- [ ] Date picker navigates between available dates
- [ ] "Ingest" and "Run Reconciliation" buttons are functional

### Magnet Board View
- [ ] All acceptance criteria from Phase 1 PRD Section 8 are met
- [ ] Board renders from `reconciliation_results` (not mock data)
- [ ] Date picker changes the board data
- [ ] Filters (job / role / status) compose correctly
- [ ] Tweaks panel tolerance slider re-classifies magnets in real time
- [ ] Side panel shows correct reconciliation data + 7-day chart
- [ ] AI Summary panel shows findings from `get_ai_summary` edge function
- [ ] Responsive: ≥1024px full layout, <760px swipeable carousel

### Auth
- [ ] Unauthenticated users are redirected to `/login`
- [ ] Login works with existing accounts
- [ ] Role permissions are enforced on Ingest and Run Reconciliation buttons
- [ ] All authenticated users can view Report and Board

---

## 12. Out of Scope — Future Work

- Real-time telematics via Supabase Realtime subscriptions
- Map view with geofencing
- Multi-provider telematics (VisionLink, MyKomatsu, e360)
- Write mode: flag-for-review persistence
- DST-aware timezone handling (currently hardcoded PDT)
- PDF export of reconciliation report
- Non-JD-Link equipment reconciliation
- Historical reconciliation (batch processing of past dates)
- AI inference in the AI Summary panel (stubbed to return static findings for v2)

---

## 13. Change Log

Post-v2 changes shipped on top of the baseline PRD. Each entry documents a discrete change request.

### CR-001 — Magnet Board Horizontal Slider (commit `537903e`, 2026-04-23)

Added slider-based navigation to the Magnet Board so all 23 jobs from the April 17 reconciliation are reachable, not just the first 6.

**Shipped:**
- Prev/next buttons for stepwise column-group navigation
- Native range slider bound to current column index
- Keyboard arrow-key support (left/right to step)
- Smooth 300ms ease-out slide animation via CSS `transform: translateX()`
- Virtualization: only renders visible columns + 1 buffer on each side
- Position indicator (e.g., "1 / 23")

**Files touched:** `src/views/MagnetBoard.tsx`, `src/index.css`

**Reference:** `ARCHIVED/change-requests/CR-magnet-board-slider.md`

---

### CR-002 — Magnet Board Mobile Swipe (commit `8dc6fbc`, 2026-04-23)

Added touch swipe navigation and mobile-responsive column sizing so the Magnet Board is usable on phones and tablets.

**Shipped:**
- Touch swipe gestures via native `onTouchStart` / `onTouchMove` / `onTouchEnd` handlers
- 50px swipe threshold to trigger a slide (below threshold = no-op, prevents accidental swipes)
- Responsive column sizing: 1 column on phone, 2 on tablet, 6 on desktop
- Vertical scroll preserved — only horizontal swipes trigger navigation
- All existing desktop controls (prev/next, range slider, keyboard arrows) continue to work

**Files touched:** `src/views/MagnetBoard.tsx`

**Reference:** `ARCHIVED/change-requests/CR-magnet-board-mobile-swipe.md`

---

### CR-003 — Report Column Reorder for Mobile Visibility (commit `4dbc99e`, 2026-04-23)

Reordered the Reconciliation Report table columns so Status and Variance — the most important signals — appear immediately after Equipment instead of at the far right, where they were pushed off-screen on mobile.

**Shipped:**
- New column order: Job | Foreman | Equipment | **Status** | **Variance** | Description | Sched | Billed | Actual
- Status and Variance are now visible on phones without horizontal scrolling
- Sort behavior preserved for every column

**Files touched:** `src/views/Report.tsx`

**Reference:** `ARCHIVED/change-requests/CR-report-column-reorder-mobile.md`

---

### CR-004 — Report Column Reorder v2 (commit `9b531c8`, 2026-04-23)

Further reordered the Reconciliation Report columns so Status and Variance appear before Equipment, pushing the two most important signals to the left edge for mobile visibility on the first screen.

**Shipped:**
- New column order: Job | Foreman | **Status** | **Variance** | Equipment | Description | Sched | Billed | Actual
- Status and Variance now surface before Equipment on mobile, visible without horizontal scrolling
- Sort behavior preserved for every column

**Files touched:** `src/views/Report.tsx`

**Reference:** `ARCHIVED/change-requests/CR-report-column-reorder-v2.md`

---

### CR-005 — Magnet Board Job Filter Dropdown Scrollable (commit `TBD`, 2026-04-23)

Made the Magnet Board's job filter dropdown always render and show every available job with full code + name, so all 23 jobs are reachable from the filter.

**Shipped:**
- Dropdown always visible (previously only rendered when job count > 5)
- Every job listed with full `job_code — job_name` label (no 24-char truncation)
- "All Jobs" option pinned at the top
- Native `<select>` provides built-in scrollable overflow when the list exceeds viewport height

**Files touched:** `src/views/MagnetBoard.tsx`

**Reference:** `ARCHIVED/change-requests/CR-magnet-board-job-filter-scroll.md`
