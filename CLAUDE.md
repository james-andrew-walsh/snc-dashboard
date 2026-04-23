# SNC Equipment Reconciliation Dashboard — Claude Code Handoff

**Read `PRD.md` first.** It is the source of truth for all functionality.

## Supabase Project
- Project: `ghscnwwatguzmeuabspd`
- Dashboard: https://supabase.com/dashboard/project/ghscnwwatguzmeuabspd
- API Base: `https://ghscnwwatguzmeuabspd.supabase.co`

## Current Database State
**Schema must be built from scratch per PRD.md.**

Existing tables (keep, do not delete):
- `user_profiles` — user accounts, roles, RLS already configured
- `TelematicsSnapshot` — raw telematics readings (equipmentCode, snapshotAt, hourMeterReadingInHours, etc.)
- `TelematicsProvider` — provider registry
- `spatial_ref_sys` — PostGIS (ignore)
- `auth.users` — Supabase managed (ignore)

**Deleted tables (do not restore):**
BusinessUnit, Equipment, Job, Location, Employee, DispatchEvent, CrewAssignment, Anomaly, SyncLog, SiteLocation, SiteLocationJob, JobEquipment, TelematicsSnapshot (old — see above), reconciliation_results

## Auth Setup (Preserved)
- Email/password login via Supabase Auth
- `user_profiles` table has `id` (FK to auth.users), `role` column
- Roles: `admin`, `dispatcher`, `read_only`, `agent_write`, `agent_read`
- Existing users:
  - james@precisioncompaction.com — admin
  - brian@mcpnv.com — dispatcher (or similar, confirm)
  - agent-write@... / agent-read@... service accounts

## Build Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build (TypeScript check + Vite)
- `npm run lint` — ESLint
- `npm run preview` — Preview production build

## Tech Stack
- React 19 + TypeScript + Vite 8
- Tailwind CSS v4
- @supabase/supabase-js
- Supabase Edge Functions (for reconciliation engine)
- State-based routing (no react-router)

## Project Structure
```
src/
  lib/
    supabase.ts     — Supabase client (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env.local)
    types.ts        — TypeScript interfaces
  hooks/
    useSupabaseQuery.ts
  context/
    AuthContext.tsx — Auth provider
  components/
    Layout.tsx
    Sidebar.tsx     — Nav: Reconciliation Report + Magnet Board + Admin
  pages/
    Login.tsx
    AuthCallback.tsx
    Admin.tsx
  views/
    Report.tsx      — TO BE BUILT per PRD.md Section 5.1
    MagnetBoard.tsx — TO BE BUILT per PRD.md Section 5.2
```

## Views to Build
1. **Reconciliation Report** (`/report`) — Data table with filters, summary cards, export
2. **Magnet Board** (`/magnet-board`) — Visual board per job site

Both views read from Supabase. Supabase credentials are in `.env.local`.

## References
- `PRD.md` — Full product specification (read first)
- `references/magnet-board-prd.md` — Magnet Board interaction spec
- `schema/dispatch-schema.json` — Dispatch report JSON schema

## Done Criteria
- `npm run build` succeeds with zero errors
- Both views render and read/write from Supabase
- Reconciliation edge functions are implemented
- Auth flow works end-to-end
