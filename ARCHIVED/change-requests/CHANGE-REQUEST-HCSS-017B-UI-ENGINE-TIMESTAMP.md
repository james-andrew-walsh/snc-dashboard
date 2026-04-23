# HCSS-017B: Reveal Engine Status Staleness (Frontend)

## Problem
The OEM telematics API sometimes reports an engine as `Active` even when the `lastEngineStatusDateTime` is days or weeks old. The backend (HCSS-017A) now captures this timestamp. The dashboard must expose this data so the user can see if an "Active" engine is actually a stale report.

## Implementation Details

### RPC Update
- Ensure the `engineStatusAt` field is surfaced by `get_latest_telematics()` and passed through the GeoJSON properties to the map UI.

### Map Popup UI
- Add a new line to the map popup when clicking a machine.
- Show the engine status along with its report date/time.
  - Example: `Engine: Active`
  - Example: `Engine Report: 3 weeks ago` (or exact date/time)

## Dependencies
- Requires HCSS-017A (backend schema and edge function updates) to be completed first.
