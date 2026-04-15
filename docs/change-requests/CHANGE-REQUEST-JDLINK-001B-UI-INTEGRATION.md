# Change Request: JDLINK-001B-UI-INTEGRATION

## Objective
Update the `snc-dashboard` frontend to visualize JDLink telematics alongside HCSS telematics, and allow filtering and comparison between different telematics providers.

## Context
With the introduction of the JDLink ISO 15143-3 (AEMP 2.0) telematics integration in `snc-cli` (see `JDLINK-001A`), our single `equipment_telemetry` table now stores data from multiple providers (`provider` column: 'JDLink', 'HCSS', etc.). The dashboard must visually distinguish these sources and allow us to spot discrepancies between them (e.g., if JDLink reports a different location or engine hours than HCSS for the same machine).

## Required Changes

### 1. Data Fetching & Provider Filtering
- Update API calls/RPCs to include the new `provider` column in the telemetry data.
- Update the UI equipment list/map view with a "Telematics Provider" filter dropdown (e.g., 'All', 'HCSS', 'JDLink').
- Ensure the selected provider controls which telemetry dots appear on the map and which data populates the side panel.

### 2. Equipment Detail View Updates
- On the individual equipment detail panel, display the provider-specific data if available:
  - JDLink specific: Idle Hours, Fuel Remaining (%), Fuel Consumed (liters), DEF Remaining (%).
- If multiple providers report data for the same machine, visually distinguish the "Ground Truth" source currently displayed.

### 3. Discrepancy / Comparison Mode
- Implement a "Comparison Mode" toggle on the map and/or anomaly list.
- When enabled, highlight machines that have conflicting data between HCSS and JDLink (e.g., GPS coordinates differ by > 50 meters, or engine hours differ significantly).
- In the equipment side panel, show a side-by-side comparison of HCSS reported vs JDLink reported telemetry when a discrepancy exists.

## Acceptance Criteria
- [ ] Users can filter the map and equipment list by 'Telematics Provider'.
- [ ] JDLink-specific data (fuel, DEF, idle hours) is visible in the equipment details panel when the provider is 'JDLink'.
- [ ] The dashboard successfully fetches and parses the new unified `equipment_telemetry` format including the `provider` field.
- [ ] A comparison mode exists that highlights discrepancies between HCSS telematics and JDLink telematics for the same equipment ID.
