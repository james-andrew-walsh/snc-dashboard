# CR-011: Run Reconciliation Edge Function

## Status
Draft — awaiting execution

## Requested By
James Walsh

## Date
2026-04-24

---

## Problem

The dashboard shows dispatch data for all three dates (Apr 17, 24, 25), but the reconciliation — comparing dispatched equipment against HeavyJob timecards and JD Link engine hours — only exists as a Python script (`reconcile.py`) running on the Mac mini. The dashboard's "Run Reconciliation" button invokes a stub edge function that does nothing real. We need the full reconciliation algorithm running as a self-contained Supabase Edge Function so the button works and the system is portable.

---

## Solution

Build a new edge function (`run-reconciliation`) that, for a given report date:
1. Reads the extracted dispatch data from `dispatch_equipment_assignments` (populated by CR-010's `dispatch-extract`)
2. Authenticates with HCSS HeavyJob and JD Link APIs
3. For each job: looks up HeavyJob UUID, fetches timecards for that date, gets billed hours per equipment
4. For each equipment with JD Link telematics: fetches engine hour readings, computes actual hours
5. Compares billed vs actual, classifies status (pass/variance/idle/skipped/no-data)
6. Writes results to `reconciliation_results` table
7. Updates `dispatch_reports.status` to `reconciled`

### Requirements

1. **HCSS HeavyJob integration**: OAuth2 client_credentials grant, then:
   - `GET /heavyjob/api/v1/jobs?businessUnitId={BU_ID}&$top=9999` → find job UUID by code
   - `GET /heavyjob/api/v1/timeCardInfo?jobId={UUID}` → filter timecards by date
   - `GET /heavyjob/api/v1/timecards/{timecardId}` → get equipment + billed hours detail

2. **JD Link integration**: OAuth2 refresh_token grant (refresh token stored in Supabase secret `JDLINK_REFRESH_TOKEN`), then:
   - `GET https://api.deere.com/isg/equipment?organizationIds={ORG_ID}&$top=500` → build equipment code → principalId map
   - `GET https://api.deere.com/platform/machines/{principalId}/engineHours?startDate={UTC}&endDate={UTC}` → get readings for date window

3. **JD Link refresh token rotation**: The JD Link OAuth flow returns a new refresh token on each use. The old one is invalidated. The edge function MUST persist the new refresh token back to Supabase secrets (or a database table) after each auth call. Failure to do this will break all subsequent JD Link calls. Use a `jdlink_tokens` table or update the Supabase Management API to rotate the secret.

4. **Engine hours calculation**: For a given date (PDT midnight to midnight):
   - UTC window: `{date}T07:00:00Z` to `{date+1}T06:59:59Z`
   - Delta = max(readings) - min(readings), excluding anomalous 0.00 readings (filter: `hours > 1`)
   - Follow pagination (`nextPage` links) — JD Link returns 10 readings per page
   - Returns (delta_hours, reading_count)

5. **Variance classification**:
   - `|billed - actual| <= 0.5` → status `ok` (pass)
   - `actual == 0 && billed > 0` → status `idle`
   - `|billed - actual| > 0.5` → status `over` (billed > actual) or `under` (actual > billed)
   - No JD Link principal ID → status `skipped`, notes "no JD Link"
   - No readings → status `no-data`
   - No billed hours in HeavyJob → status `skipped`, notes "no HeavyJob billed hours"
   - Equipment on HeavyJob timecard but NOT on dispatch → status `billed-not-dispatched`

6. **Idempotent**: Delete existing `reconciliation_results` for the report_id before writing new ones. Re-running produces identical results (given the same external API state).

7. **Invocation**:
   - `POST { "reportDate": "2026-04-24" }` → reconcile that specific date
   - The dashboard's "Run Reconciliation" button should call this function with the currently selected date

8. **Alt-code propagation**: Copy `alt_code` from `dispatch_equipment_assignments` to `reconciliation_results` for each equipment row.

9. **Scheduled hours**: Parse `sched_start` and `sched_end` from `dispatch_equipment_assignments` to compute `sched_hours` (end - start in hours).

### Environment Variables (already set as Supabase secrets)
- `HCSS_CLIENT_ID`, `HCSS_CLIENT_SECRET` — HeavyJob OAuth
- `HCSS_BU_ID` — SNC business unit ID (`c86488a1-585f-4be8-82fc-db3f607412df`)
- `JDLINK_APP_ID` — JD Link client ID
- `JDLINK_SECRET` — JD Link client secret
- `JDLINK_REFRESH_TOKEN` — JD Link refresh token (rotated on each use)
- `JDLINK_ORG_ID` — JD Link organization ID (`296091`)
- `JDLINK_CLIENT_ID`, `JDLINK_CLIENT_SECRET` — JD Link OAuth (same as APP_ID/SECRET)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase access

### API Reference (from working Python implementation)

**HCSS Token:**
```
POST https://api.hcssapps.com/identity/connect/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {client_id:client_secret}
Body: grant_type=client_credentials&scope=heavyjob:read timecards:read
```

**HCSS Jobs:**
```
GET https://api.hcssapps.com/heavyjob/api/v1/jobs?businessUnitId={BU_ID}&$top=9999
Authorization: Bearer {token}
Returns: array of {id, code, description, ...}
```

**HCSS Timecards for job:**
```
GET https://api.hcssapps.com/heavyjob/api/v1/timeCardInfo?jobId={jobUUID}
Authorization: Bearer {token}
Returns: {results: [{id, date, ...}]}
Filter: keep only where date starts with target date
```

**HCSS Timecard detail:**
```
GET https://api.hcssapps.com/heavyjob/api/v1/timecards/{timecardId}
Authorization: Bearer {token}
Returns: {equipment: [{equipmentCode, totalHours: [{hours}]}], ...}
```

**JD Link Token:**
```
POST https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7/v1/token
Content-Type: application/x-www-form-urlencoded
Body: grant_type=refresh_token&client_id={APP_ID}&client_secret={SECRET}&refresh_token={REFRESH}&scope=eq1 offline_access
Returns: {access_token, refresh_token (NEW — must persist)}
```

**JD Link Machines:**
```
GET https://api.deere.com/isg/equipment?organizationIds={ORG_ID}&$top=500
Authorization: Bearer {token}
Accept: application/json
Returns: {values: [{name (=equipmentCode), principalId, serialNumber}]}
```

**JD Link Engine Hours:**
```
GET https://api.deere.com/platform/machines/{principalId}/engineHours?startDate={utcISO}&endDate={utcISO}
Authorization: Bearer {token}
Accept: application/json
Returns: {values: [{reportTime, value}], links: [{rel:"nextPage", uri:"..."}]}
```

### Dashboard Button Wiring

The dashboard already has a "Run Reconciliation" button. It currently tries to invoke an edge function. Update it to call `run-reconciliation` with the selected report date and show a loading state while it runs. On completion, refetch the snapshot data so the table populates.

### Reference: Existing patterns
- `core/supabase/functions/telemetrics-sync/` — JD Link auth + HCSS auth patterns
- `core/supabase/functions/dispatch-extract/` — Supabase table read/write patterns
- `projects/SNC/equipment-tracking/scripts/reconcile.py` — The canonical Python implementation (lines 527–815)

---

## Files to Create/Modify

- `core/supabase/functions/run-reconciliation/index.ts` — **CREATE** — Edge function entry point
- `core/supabase/functions/run-reconciliation/hcss.ts` — **CREATE** — HCSS HeavyJob API client
- `core/supabase/functions/run-reconciliation/jdlink.ts` — **CREATE** — JD Link API client
- `src/views/Report.tsx` or equivalent — **MODIFY** — Wire "Run Reconciliation" button to new function
- `PRD.md` — **MODIFY** — Update Change Log

---

## Done When

- [ ] Edge function `run-reconciliation` deployed to `ghscnwwatguzmeuabspd`
- [ ] Clicking "Run Reconciliation" on the dashboard for Apr 17 produces reconciliation_results matching the existing seed data pattern
- [ ] Clicking "Run Reconciliation" on Apr 24 populates reconciliation_results and the dashboard shows real data
- [ ] Variance classification matches the Python implementation's logic
- [ ] JD Link refresh token is properly rotated and persisted
- [ ] `dispatch_reports.status` updated to `reconciled` after successful run
- [ ] `alt_code` populated on reconciliation_results
- [ ] `npm run build` passes with zero errors
- [ ] Committed to GitHub

---

## Done

When complete, also update PRD.md: Add an entry to the Change Log section documenting what was built.

---

## Commit Message

When committing, include the full CR text in the commit message body (not just the title) so the change is self-documenting in git log.
