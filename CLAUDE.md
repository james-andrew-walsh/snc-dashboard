# SNC Equipment Reconciliation Dashboard

## Build Commands
- `npm run dev` — Start Vite dev server
- `npm run build` — Production build (TypeScript check + Vite build)
- `npm run lint` — ESLint check
- `npm run preview` — Preview production build

## Tech Stack
- React 19 + TypeScript + Vite 8
- Tailwind CSS v4 (via @tailwindcss/vite plugin)
- @supabase/supabase-js for REST + Realtime
- State-based routing (no react-router)

## Project Structure
```
src/
  lib/
    supabase.ts     — Supabase client
    types.ts        — TypeScript interfaces (old HCSS types; to be replaced)
  hooks/
    useSupabaseQuery.ts — Generic data fetching hook
  context/
    AuthContext.tsx — Auth provider
  components/
    Layout.tsx      — Main layout wrapper
    Sidebar.tsx     — Left nav (report + magnet-board + admin)
  pages/
    Login.tsx       — Login page
    AuthCallback.tsx — OAuth callback handler
    Admin.tsx       — User management (admin only)
  views/
    Report.tsx      — Reconciliation Report view (TO BE BUILT)
    MagnetBoard.tsx  — Magnet Board view (TO BE BUILT)
```

## References
- `PRD.md` — Full product specification. **Read this first.**
- `references/magnet-board-prd.md` — Magnet Board visual and interaction spec (incorporated into PRD.md Section 5.2)
- `schema/dispatch-schema.json` — Dispatch report JSON schema

## Auth
- Supabase email/password auth
- Roles: `admin`, `dispatcher`, `read_only`, `agent_write`, `agent_read`
- RLS enabled on all tables

## Done Criteria
- `npm run build` succeeds with zero errors
- Both views (Report and MagnetBoard) render and read from Supabase
- Dispatch ingest and reconciliation edge functions are implemented and callable
