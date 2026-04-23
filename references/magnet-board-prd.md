# PRD — SNC Equipment Tracking Magnet Board (Front-End, Phase 1)

**Product:** SNC Dispatch Board — digital equivalent of the physical color-magnet board used by dispatch/foremen at SNC.
**Phase:** 1 of 2. This PRD covers the front-end only, with **simulated data**. Phase 2 (future Change Requests) will swap the simulated data layer for a live Supabase back end.
**Target:** Web app, responsive (desktop-first, must also work on tablet + phone).
**Owner:** Dispatch / Equipment Manager.
**Audience for this PRD:** Claude Code (implementation).

---

## 1. Context & Background

SNC currently runs daily dispatch on a physical magnet board divided into columns (one per active job). Each column holds color-coded magnets:

- **Red** — Foreman
- **Yellow** — Operator (with union local: L169, L3, etc.)
- **Green** — Laborer
- **Blue** — Equipment (trucks, loaders, excavators, rentals, trailers, etc.)

Each morning the board is populated from the schedule in HCSS Heavy Job. Throughout the day, equipment hours are logged as **Scheduled / Billed / Ran**:

- **Scheduled** — what was planned in HCSS
- **Billed** — what the foreman wrote on their daily time card
- **Ran** — actual engine hours reported by telematics (JDLink, VisionLink, e360, MyKomatsu)

A discrepancy between Billed and Ran is the core dispatch problem this app exposes. Equipment without telematics shows up as "no data" and must be reconciled manually.

The app replaces the physical board with a digital surface that:
1. Shows today's assignments at a glance.
2. Surfaces billing vs telematics variance in real time.
3. Lets dispatch drill into any piece of equipment for detail + history.
4. Uses an AI summary to highlight what needs attention.

---

## 2. Goals & Non-Goals

### Goals (Phase 1)
- **G1.** Replicate the visual language of the physical magnet board (color-coded role magnets, job columns, handwritten-style job headers).
- **G2.** Show three-way reconciliation per piece of equipment: Sched / Billed / Ran, with a clearly-flagged variance when Billed ≠ Ran beyond tolerance.
- **G3.** Provide per-equipment drill-down with telematics source, last sync, and a 7-day trend chart.
- **G4.** Provide filter chips (by job, by role, by status: Flagged / No-data) and a top-level AI summary panel.
- **G5.** Fully responsive — usable on desktop, tablet, and phone.
- **G6.** Ship with a **mock data module** (`data.mock.js` or similar) that is the **single source of data** for the UI. All components read from this module via a thin adapter so Phase 2 can swap it with no component changes.

### Non-Goals (Phase 1 — explicitly out of scope)
- **N1.** No real backend, no auth, no Supabase, no API calls.
- **N2.** No drag-and-drop reassignment of magnets.
- **N3.** No edit/create flows — read-only view of the day.
- **N4.** No PDF export or printing.
- **N5.** No multi-user real-time sync.

---

## 3. Users & Primary Scenarios

**Primary user:** Dispatch / Equipment Manager sitting at a desk with a wide monitor.
**Secondary user:** Foreman or field super checking the board from a phone.

**Scenarios:**
- *S1 — Morning review.* User opens board at 7:00 AM, sees all four jobs populated, scans for red-bordered (flagged) magnets. Expected: immediate visual focus on variances.
- *S2 — Drill in.* User taps a flagged equipment magnet. A side panel slides in with reconciliation, source, and 7-day trend.
- *S3 — Filter.* User wants to see only problems. Filters to "Flagged" — all OK magnets hide.
- *S4 — AI triage.* User clicks AI Summary panel findings to jump directly to the problem magnet.
- *S5 — Phone use.* Foreman checks from phone — the board collapses to a single job at a time, swipeable between jobs.

---

## 4. Functional Requirements

### 4.1 Layout — Top Bar
- **Brand mark** (SNC logo square + "Dispatch Board" / "Equipment · Reconciliation" subtitle).
- **Date picker** — prev/next day arrows, current date display, weekday + "Today" label.
- **Filter chips — Job:** "All · N", plus one chip per job.
- **Filter chips — Role:** All / Foreman / Operator / Laborer / Equipment.
- **Filter chips — Status:** "Flagged · N" (flag badge), "No data · N" (grey badge).
- **AI Summary toggle** (primary action button).
- **Alerts badge** — pulsing red dot + total alert count.
- On mobile, this collapses to brand + date + hamburger. All filters move to a bottom sheet.

### 4.2 Layout — Board
- Horizontal grid, one **column per active job**.
- Each column has:
  - Handwritten-style (Caveat font) header: job name, job code, subtitle (e.g. "Storm Drain / Manholes"), start time.
  - Dashed divider, then groups for **Foreman**, **Operators · N**, **Laborers · N**, **Equipment · N**.
  - Small uppercase role-group labels.
- Columns are divided by 2px solid gray lines (mimicking whiteboard marker grid).
- Background has subtle pixel texture + horizontal guide lines every 48px to evoke a whiteboard.

### 4.3 Magnet Cards
All magnets share a common anatomy: **colored header stripe** + **white body**.

- **Foreman magnet** (red header): surname (bold, mono), first name, tag "FOREMAN".
- **Operator magnet** (yellow header, dark text): surname, first name, tag = union local (L169, L3).
- **Laborer magnet** (green header): surname, first name, tag = union local.
- **Equipment magnet** (blue header):
  - Header: equipment kind (LIGHT TRUCK, LOADER, EXCAVATOR, RENTAL, TRAILER, ROLLER, MISC), tag = telematics provider or "NO TLMTRY".
  - Body: equipment code (mono) + short name.
  - **Metric strip** (3 cells): Sched · Billed · Ran. Each cell: tiny uppercase label, large mono value.
  - **Variance row** appears below the metric strip when |Billed − Ran| > tolerance — shows variance with red tint and ± sign.
  - **Flagged state** — red 1.5px border + slow pulse outline animation.
  - **No-data state** — Ran cell and variance cell use diagonal-stripe pattern, em-dash for missing values.
  - **Selected state** — blue outline offset ring.

### 4.4 Side Detail Panel
Opens when a magnet is clicked. On desktop: 380px fixed right-side column. On mobile: full-screen drawer sliding in from right with a scrim.

Contents:
- Header: kind label, big mono code, equipment name, close (✕) button.
- **Today · Reconciliation** — three metric tiles (Scheduled, Billed, Ran). Ran tile is red-tinted if flagged, striped if no-data. Followed by a variance row (red / green / grey).
- **Source** — key/value list: Telematics provider, last sync, equipment ID, category.
- **7-Day Trend** — SVG line chart overlaying Scheduled (dashed gray), Billed (blue), Ran (orange). X-axis labels "-6d ... TODAY". Legend below.
- **Actions** — "Flag for Review" (primary dark), "Open in HCSS Heavy Job", "View raw telematics log".

Empty state when nothing selected: centered message "No cell selected" with brief instruction.

### 4.5 AI Summary Panel
Floating cream-colored card (top-right on desktop, bottom sheet on mobile). Dismissible via ✕ or the toolbar toggle.

Contents:
- Title: "⚘ AI Reconciliation Summary".
- Opening paragraph with bolded counts: "**N** pieces of equipment showing significant variance today. **M** have no telematics data."
- List of clickable findings. Each finding: mono equipment code badge + a plain-English sentence (e.g. "Billed 10 hr but ran 6.2 hr — over-reported by 3.8 hr").
- Clicking a finding selects that equipment (opens side panel, scrolls to it).
- Meta line: "Generated 7:02 AM · Haiku 4.5 · 38s ago".

### 4.6 Filtering Behavior
- **Job filter** — reduces visible columns to the selected job.
- **Role filter** — hides role groups that don't match.
- **Status filter** (Flagged / No-data) — when active, hides OK equipment magnets.
- "Hide OK cells" toggle (Tweaks) — global shortcut for the above.
- All filters compose additively.

### 4.7 Variance Tolerance
- Default **±0.5 hr**.
- Configurable via Tweaks slider (0.0 — 2.0, step 0.1).
- Any equipment with |Billed − Ran| ≤ tolerance is "ok" and does not flag.

### 4.8 Tweaks Panel
- Floating panel, bottom-right on desktop, horizontally full-width above the mobile bottom bar on phones.
- Has **a close (✕) button** in its header — this is required, do not ship without it.
- Controls: variance tolerance slider, "Show only problems" checkbox, "AI Summary panel" checkbox, column density (compact/normal/wide) 3-way toggle.
- Tweaks visibility is toggled by the host toolbar (postMessage protocol — see §6).

### 4.9 Responsive Behavior
- **≥1024px** — full layout as described.
- **760–1023px** — top bar wraps; filters become horizontally scrollable; side panel becomes a slide-in drawer.
- **<760px** — single job column visible at a time, horizontal swipe between columns with scroll-snap; sticky "job tabs" row at top shows which column is active and lets the user jump; filter chips removed from the top bar and moved into a bottom filter sheet invoked via a hamburger button; a persistent bottom bar provides Board / Filters / AI entry points; side panel is a full-screen drawer.

---

## 5. Data Model & Mock Data

Implement a single module `src/data/mock.js` that exports one object:

```js
window.SNC_DATA = {
  jobs:      Job[],
  foremen:   Person[],
  operators: Person[],
  laborers:  Person[],
  equipment: Equipment[],
  history:   Record<equipmentCode, HistoryPoint[]>,
  TOL:       number,  // default tolerance in hours
}
```

### Types
```ts
Job = {
  id: string,              // 'j1', 'j2', ...
  code: string,            // '11807'
  name: string,            // 'Stead Storm Drain'
  subtitle: string,        // 'Storm Drain / Manholes'
  startTime: string,       // '6:00'
  location: string,        // 'Stead, NV'
}

Person = {
  jobId: string,
  last: string,            // 6-letter board convention, UPPERCASE
  first: string,
  local?: string,          // 'L169' | 'L3' — operators & laborers only
  phone?: string,          // foremen only
  tag?: string,
}

Equipment = {
  jobId: string,
  code: string,            // 'TK9850'
  kind: string,            // 'LIGHT TRUCK' | 'LOADER' | 'EXCAVATOR' | 'RENTAL' | 'TRAILER' | 'ROLLER' | 'MISC'
  name: string,            // 'Ford F-150 4x4'
  sched: number,           // hours
  billed: number,          // hours
  ran: number | null,      // null = no telematics
  provider: string | null, // 'e360' | 'JDLink' | 'VisionLink' | 'MyKomatsu' | null
  // derived (computed by adapter, not stored):
  variance?: number | null,
  status?: 'ok' | 'over' | 'under' | 'no-data',
}

HistoryPoint = {
  day: number,             // days-ago (0 = today, 6 = six days ago)
  sched: number,
  billed: number,
  ran: number | null,
}
```

### Seed data
Provide at least **4 jobs**, **4 foremen**, **16 operators**, **20 laborers**, **37 equipment entries** with a realistic mix:
- ~60% OK (within tolerance)
- ~25% flagged (over- or under-reported)
- ~15% no-data
- Providers drawn from `e360`, `JDLink`, `VisionLink`, `MyKomatsu`
- Equipment kinds spread across LIGHT TRUCK, LOADER, EXCAVATOR, RENTAL, TRAILER, ROLLER, MISC

History data (7 days per equipment) is synthesized deterministically from the equipment code so it's stable across reloads.

### Data adapter
Create `src/data/adapter.js` that exposes these pure functions:
```js
getJobs(): Job[]
getCrewForJob(jobId): { foremen, operators, laborers }
getEquipmentForJob(jobId, opts?: { flagFilter, hideOk, tolerance }): Equipment[]
getHistory(code): HistoryPoint[]
deriveStatus(eq, tolerance): 'ok' | 'flagged' | 'no-data'
buildFindings(equipment, tolerance): Finding[]
```

**Components must only use the adapter — never import `SNC_DATA` directly.** This is the seam Phase 2 will replace.

---

## 6. Technical Requirements

### 6.1 Stack
- **React 18** (no build step required; prototype may use Babel-in-browser with pinned versions below, OR Vite if the team prefers tooling — either is fine).
- Single-file JSX components are acceptable. Split large files (>300 lines) into components.
- No CSS framework — hand-written CSS in a single stylesheet with CSS custom properties for the design tokens.
- No component library. No icons library (use inline SVG or text glyphs).

### 6.2 Design tokens (CSS custom properties)
```
--board-bg: #F2EFE7
--board-lines: #CFD4D9
--board-lines-strong: #A5ACB4
--ink: #1C2430
--ink-soft: #4A5568
--ink-faint: #6B7380
--paper: #FFFFFF
--paper-dim: #F7FAFC

--role-foreman: #C53030
--role-operator: #E2B93B
--role-laborer: #2F855A
--role-equipment: #2B6CB0

--flag: #E53E3E
--warn: #DD6B20
--ok: #2F855A
```

### 6.3 Fonts
- Inter 400/500/600/700/800 — UI
- JetBrains Mono 400/500/600/700 — codes, numbers
- Caveat 500/600/700 — handwritten job headers

### 6.4 Tweaks integration (host protocol)
The app is embedded in a host that can toggle Tweaks mode. Implement this protocol:

1. On mount, register a `window.addEventListener('message', ...)` for `{type: '__activate_edit_mode'}` (show Tweaks) and `{type: '__deactivate_edit_mode'}` (hide Tweaks).
2. After the listener is live, post `{type: '__edit_mode_available'}` to the parent.
3. When the user changes a tweak, post `{type: '__edit_mode_set_keys', edits: {...}}` to persist.
4. Wrap the default tweak values in `/*EDITMODE-BEGIN*/{...}/*EDITMODE-END*/` markers inside an inline script in the HTML so the host can rewrite the defaults on disk.

### 6.5 Performance
- Page must be interactive in < 1 second on a modern laptop.
- Scrolling the board must be 60fps even with all 37 equipment magnets rendered.
- Pulsing/flag animations are CSS-only (no JS rAF).

### 6.6 Accessibility
- All interactive elements reachable via keyboard.
- Tap targets ≥ 44×44 px on mobile.
- Contrast ≥ 4.5:1 for body copy, ≥ 3:1 for large text and UI elements.
- The Foreman/Operator/Laborer/Equipment distinction must not rely on color alone — each magnet also carries its role label in text.

---

## 7. Visual & Interaction Spec

### Magnet hover / selected
- Hover: translateY(-1px) + stronger shadow.
- Selected: 2px blue outline, 2px offset.

### Flag pulse
- 2.2s infinite ease-in-out keyframe animation, 0 → 3px red glow at 50%.

### Side-panel transition (mobile)
- 280ms cubic-bezier(.2,.7,.2,1) slide-in from right.
- Scrim fade 240ms.

### Swipeable job carousel (mobile)
- `scroll-snap-type: x mandatory` on the board wrapper, `scroll-snap-align: start` on each column.
- Job-tabs row reflects current snap index, click to programmatic `scrollTo`.

---

## 8. Deliverables & Acceptance

### Deliverables
1. `index.html` — single-page app entry.
2. `src/data/mock.js` — seed data.
3. `src/data/adapter.js` — data access layer.
4. `src/components/` — magnet, column, side panel, AI summary, topbar, tweaks, mobile bar/sheet, drawer.
5. `src/styles.css` — all styles, organized by section (tokens → top bar → board → magnets → side panel → AI panel → tweaks → responsive).
6. Working demo in ≤ 1 file if Babel-in-browser, or with `npm run dev` if Vite.

### Acceptance criteria (checklist)
- [ ] Four job columns render with correct handwritten headers.
- [ ] All role groups color-coded; all magnet variants present.
- [ ] Equipment magnets show Sched/Billed/Ran; variance row appears only when outside tolerance.
- [ ] Flagged magnets pulse; no-data magnets show diagonal stripes.
- [ ] Clicking a magnet opens the side panel with correct data + 7-day chart.
- [ ] AI Summary lists findings; clicking one opens the panel for that magnet.
- [ ] Filter chips (job/role/status) compose correctly; counts are live.
- [ ] Tweaks panel appears when toolbar toggle activates; **has a functioning close button**; tolerance slider immediately re-classifies magnets.
- [ ] At <760px width: single column swipeable, job tabs sticky, hamburger opens filter sheet, bottom bar shows Board/Filters/AI, side panel becomes drawer.
- [ ] No console errors; no layout shifts on load.
- [ ] All data flows through `adapter.js` — no component imports `mock.js` directly.

---

## 9. Phase 2 Preview (not in scope now, informational)

In Phase 2, the `adapter.js` module will be rewritten to call Supabase:
- `jobs`, `crew`, `equipment`, `telematics_readings`, `time_cards` tables.
- Realtime subscriptions for telematics updates → flagged state appears live.
- Supabase Auth for foreman / dispatch / admin roles.
- Edge functions to compute AI findings server-side.
- A writable mode: flag-for-review persists to a `review_flags` table.

Because all UI components already read through the adapter, Phase 2 is a data-layer change only — no component rewrites.

---

## 10. Open Questions (resolve before Phase 2)
- Q1. Is "Billed" sourced from the HCSS Heavy Job time-card export, or entered directly in-app?
- Q2. Are rental assets (R-prefix codes) expected to have telematics, or are they always no-data?
- Q3. Do union locals (L169, L3) need to drive any business logic, or are they display-only?
- Q4. Is the 7-day window fixed, or should the detail panel allow 14/30-day ranges?
