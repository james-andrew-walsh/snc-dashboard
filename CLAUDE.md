# SNC Equipment Tracking Dashboard

## Build Commands
- `npm run dev` — Start Vite dev server
- `npm run build` — Production build (TypeScript check + Vite build)
- `npm run lint` — ESLint check
- `npm run preview` — Preview production build

## Tech Stack
- React 19 + TypeScript + Vite 8
- Tailwind CSS v4 (via @tailwindcss/vite plugin)
- @supabase/supabase-js for REST + Realtime
- State-based routing (no react-router in views)

## Project Structure
```
src/
  lib/supabase.ts     — Supabase client
  lib/types.ts        — TypeScript interfaces for all DB tables
  hooks/useSupabaseQuery.ts — Generic data fetching hook
  hooks/useRealtime.ts      — Realtime subscription with flash highlight
  components/Layout.tsx     — Main layout wrapper
  components/Sidebar.tsx    — Left nav with mobile hamburger
  components/DataTable.tsx  — Reusable table component
  components/StatusBadge.tsx — Equipment status badge
  components/MetricCard.tsx  — Overview metric cards
  components/MapboxMap.tsx   — Map placeholder (Phase 1.3)
  views/Overview.tsx        — Dashboard overview with metrics + activity feed
  views/BusinessUnits.tsx   — Business units table
  views/Equipment.tsx       — Equipment table with realtime + status badges
  views/JobsLocations.tsx   — Jobs & Locations split view
  views/Employees.tsx       — Employee roster
  views/DispatchSchedule.tsx — Dispatch events with realtime
```

## Supabase Tables
BusinessUnit, Equipment, Job, Location, Employee, DispatchEvent

## Done Criteria
- `npm run build` succeeds with zero errors
- All 6 views render and fetch data from Supabase
- Equipment and DispatchEvent views have realtime subscriptions with flash highlight
