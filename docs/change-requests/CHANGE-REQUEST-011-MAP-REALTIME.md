# Change Request 011: Real-Time Map Updates on Overview Page

**Date:** 2026-04-06

---

## Problem

The Mapbox map on the Overview page fetches Equipment, Job, DispatchEvent, Location, and Employee data once on initial load. When the `snc` CLI dispatches equipment, updates status, or creates new records, the map does not update — a page refresh is required to see the new pins.

The activity feed and metric counts on the same page DO update in real-time (they're wired to `postgres_changes` subscriptions). The map data arrays are not.

## Fix

Update `src/views/Overview.tsx` to keep the map data arrays (`dispatches`, `equipment`, `jobs`, `locations`, `employees`) in sync with the database via the existing realtime subscription.

Inside the `postgres_changes` callback for each table, update the corresponding state array using the same INSERT/UPDATE/DELETE pattern used in other views:

```typescript
// DispatchEvent changes → update dispatches array
if (table === 'DispatchEvent') {
  if (payload.eventType === 'INSERT') setDispatches(prev => [...prev, payload.new as DispatchEvent])
  if (payload.eventType === 'UPDATE') setDispatches(prev => prev.map(d => d.id === (payload.new as DispatchEvent).id ? payload.new as DispatchEvent : d))
  if (payload.eventType === 'DELETE') setDispatches(prev => prev.filter(d => d.id !== (payload.old as {id: string}).id))
}

// Equipment changes → update equipment array
if (table === 'Equipment') {
  if (payload.eventType === 'INSERT') setEquipment(prev => [...prev, payload.new as Equipment])
  if (payload.eventType === 'UPDATE') setEquipment(prev => prev.map(e => e.id === (payload.new as Equipment).id ? payload.new as Equipment : e))
  if (payload.eventType === 'DELETE') setEquipment(prev => prev.filter(e => e.id !== (payload.old as {id: string}).id))
}
```

Also add `Employee` to the subscribed tables and add `setEmployees` state (currently employees are fetched but not subscribed).

## Expected Behavior After Fix

When `snc dispatch schedule` is run from the CLI:
1. Activity feed flashes the new dispatch (already works)
2. The map immediately shows a new equipment pin at the correct location (new behavior)
3. When `snc equipment update --status "In Use"` is run, the pin color changes on the map live (new behavior)

## Files Changed

| File | Change |
|---|---|
| `src/views/Overview.tsx` | Add INSERT/UPDATE/DELETE handlers for dispatches, equipment, jobs, locations, employees arrays inside the existing realtime callback |

## Instructions for Claude Code

1. Read `src/views/Overview.tsx` carefully — the realtime subscription is already set up at lines ~69-105
2. Add state setters for `dispatches`, `equipment`, `jobs`, `locations`, `employees` inside the existing `postgres_changes` callback
3. Add `Employee` to the `tables` array so it's subscribed
4. Also add `Location` to the subscribed tables (currently only Equipment, Job, DispatchEvent, Employee)
5. `npm run build` — verify no TypeScript errors
6. Commit and push

## Validation

After implementation:
1. Open Overview page with the map visible
2. Run: `snc dispatch schedule --equipment <yard-equip-uuid> --job JOB-002 --operator <employee-uuid> --start 2026-04-06`
3. The map should immediately show a new pin at LOC-002 (Sparks Equipment Yard — Greg Street) without refreshing
4. Run: `snc equipment update --id <uuid> --status "Down"`
5. The pin color should immediately change to red on the map
