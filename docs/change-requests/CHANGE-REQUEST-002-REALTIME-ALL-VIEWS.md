# Change Request 002: Add Real-Time Subscriptions to All Dashboard Views

## Background
The V1 Dashboard (built in CR-001 and DASHBOARD-V1-PRD.md) implemented Supabase Realtime subscriptions only on the **Equipment** and **DispatchSchedule** views. The remaining views — **Employees**, **BusinessUnits**, **Jobs**, and **Locations** — only fetched data on initial page load. Any CLI-driven changes to those tables required a manual page refresh to appear.

## Problem
The core design principle of the dashboard is **"Visual Proof of Action"**: when an agent executes a CLI command, the UI must reflect that change instantly without requiring a refresh. This was broken for 4 of the 6 views.

## The Fix
Wire `useRealtime` into every view that displays live table data.

### Views to Update

| View | Table | Status Before |
|---|---|---|
| `Employees.tsx` | `Employee` | ❌ No realtime |
| `BusinessUnits.tsx` | `BusinessUnit` | ❌ No realtime |
| `JobsLocations.tsx` | `Job`, `Location` | ❌ No realtime |
| `Equipment.tsx` | `Equipment` | ✅ Already done |
| `DispatchSchedule.tsx` | `DispatchEvent` | ✅ Already done |

### Pattern to Apply (matches Equipment.tsx)
For each view missing realtime:

1. Add `useState` import
2. Add `useRealtime` import
3. Destructure `setData` from `useSupabaseQuery` (already returned, just not consumed)
4. Add `const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set())`
5. Call `useRealtime(tableName, data, setData, flashedIds, setFlashedIds)`
6. Pass `flashedIds={flashedIds}` to `<DataTable />`

For `JobsLocations.tsx` (two tables): apply the pattern twice with distinct state pairs (`flashedJobIds` / `flashedLocIds`).

## Validation
After implementation:
1. Open the dashboard to the Employees view
2. Run: `snc employee create --business-unit <uuid> --first-name Test --last-name User --employee-code TEST-001 --role Driver`
3. The new row should appear and flash yellow **without** refreshing the page

## Status
- Implemented: 2026-04-06
- Deployed: https://snc-dashboard.vercel.app (auto-deploy via Vercel → GitHub)
- Note: This change was applied directly to `/tmp/snc-dashboard/` rather than through a Claude Code session. Future changes should follow the standard process: write CR → spawn Claude Code → implement against spec.
