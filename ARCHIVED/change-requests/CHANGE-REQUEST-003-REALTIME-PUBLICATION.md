# Change Request 003: Enable Supabase Realtime for All Tables

## Background
Supabase Realtime (`postgres_changes`) requires tables to be explicitly added to the `supabase_realtime` PostgreSQL publication before change events are broadcast. Without this, all `useRealtime` subscriptions in the dashboard silently open but never receive any events.

This was discovered when CLI-driven inserts to the `Employee` table required a manual page refresh to appear on the dashboard, despite the `useRealtime` hook being present in the code.

## The Problem
No tables were in the `supabase_realtime` publication. This means:
- Equipment real-time had never actually worked (just unnoticed since Equipment data hadn't changed since seeding)
- All 6 tables were deaf to change events

## The Fix
Apply migration `003_enable_realtime.sql` which adds all core tables to the `supabase_realtime` publication.

## Migration: `003_enable_realtime.sql`

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE 
  "BusinessUnit", 
  "Equipment", 
  "Job", 
  "Location", 
  "Employee", 
  "DispatchEvent";
```

## Validation
After applying:
1. Query `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';`
2. All 6 tables should appear in the results
3. Open the dashboard, run `snc employee create ...`, and verify the new row appears and flashes without a page refresh

## Status
- SQL applied directly to production: 2026-04-06 (via Management API — process deviation, see note below)
- Migration file created retroactively to maintain reproducibility

## Process Note
This change was applied directly via the Supabase Management API before being documented as a change request. This deviated from the established process (CR → Claude Code → implement). The migration file is being created retroactively so the full rebuild path remains documented and reproducible. Future changes must follow: identify problem → write CR → implement via Claude Code or migration.
