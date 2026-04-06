# Dashboard V1 Product Requirements Document (PRD)

**Date:** 2026-04-05
**Context:** Phase 1 Equipment Tracking Core MVP for SNC
**Status:** Draft

## 1. Concept & Vision

The V1 Dashboard is the human-facing window into the SNC Equipment Tracking system. Unlike traditional web apps where the UI is the primary method of data entry, this dashboard is designed with an **Agent-First, Voice-First** philosophy. 

The primary intended use case is for a human manager to look at the dashboard while speaking to an AI Agent (via voice). The Agent executes commands using the `snc` CLI, which updates the Supabase backend. The Dashboard listens to the database in real-time and updates instantly, providing immediate visual feedback of the Agent's actions.

While it will eventually support traditional mouse/keyboard inputs, V1 focuses entirely on **real-time observation and state reflection**.

---

## 2. Core Principles

1. **Read-Heavy, Real-Time:** The dashboard prioritizes displaying the current state of the database. It uses Supabase Realtime subscriptions to update the DOM the millisecond a record changes, without requiring page reloads.
2. **Visual Proof of Action:** When an agent assigns a piece of equipment or dispatches a driver, the UI must make that change obvious (e.g., highlighting the changed row, moving an item from one list to another).
3. **Progressive Enhancement:** Start with simple tabular views of the core entities before building complex interactive maps or Gantt charts.
4. **Mobile-Friendly:** While the primary use case is desktop (open on a monitor while the agent works), the dashboard must be fully functional on mobile devices. Responsive design ensures all views remain readable and usable on phones and tablets — especially important for on-site managers who need to check status from the field.

---

## 3. Layout & Structure

**Aesthetic:** Clean, industrial, high-contrast dark mode (SNC slate grays, safety orange, industrial blue).

### Primary Navigation (Left Sidebar)
- **Overview** (High-level metrics)
- **Business Units**
- **Jobs & Locations**
- **Equipment**
- **Employees**
- **Dispatch Schedule**

### Main Content Area (Auto-Updating)

**1. Overview**
- Top row metric cards: Total Equipment, Active Jobs, Pending Dispatches.
- Recent Activity Feed: A scrolling list of the most recent database changes (e.g., "Equipment CAT-320 transferred to Highland Job").

**2. Equipment View**
- A data grid displaying all records from the `Equipment` table.
- Columns: ID, Code, Make, Model, Status (Available, In Use, Down), Hour Meter, Assigned Job/Location.
- **Real-Time behavior:** If the CLI updates an equipment's status to "In Use", the status badge on the dashboard instantly changes color (e.g., from Blue to Green).

**3. Jobs & Locations View**
- Split view showing active `Job` records and `Location` records.
- Clicking a Job expands to show which `Equipment` is currently assigned there.

**4. Employees View**
- Simple roster of `Employee` records showing Name, Code, and Role (Driver, Crew Lead).

**5. Dispatch Schedule View**
- A chronological list or simple timeline of `DispatchEvent` records.
- Shows: Date, Equipment, Destination (Job/Location), and Assigned Driver.

---

## 4. Technical Architecture (Frontend)

- **Framework:** React (Vite or Next.js) + TypeScript.
- **Styling:** Tailwind CSS (using SNC infographic style guidelines). Responsive breakpoints ensure mobile-friendly layouts across all viewports.
- **Backend Connection:** `@supabase/supabase-js`.
- **State Management:** React hooks tied directly to Supabase real-time channels.
  - Example: `supabase.channel('equipment_changes').on('postgres_changes', ...).subscribe()`
- **Mobile Considerations:** All views use responsive Tailwind classes. Tables collapse to card-based layouts on small screens. Sidebar navigation collapses to a hamburger menu on mobile. Touch targets are appropriately sized for mobile interaction.

---

## 5. Phased Rollout Plan

**Phase 1.1: The Static Skeleton**
- Scaffold the React app and layout.
- Connect to Supabase REST API to fetch initial data on load.
- Render basic tables for Equipment, Jobs, and Employees.

**Phase 1.2: Real-Time Subscription Engine**
- Implement Supabase Realtime subscriptions.
- Add visual indicators (flash/highlight) when a row is updated, inserted, or deleted via the CLI.

**Phase 1.3: Maps & Timelines**
- Add Mapbox integration to visualize Jobs/Locations and drop equipment pins.
- Add a Gantt-style timeline for the Dispatch events.

---

## 6. The User Story (How it will be used)

1. James opens the Dashboard on his monitor.
2. James presses the button on his helmet and says: *"Bianca, transfer the Cat 320 excavator to the Highland Residence job site, and schedule John Foley to drive it there tomorrow."*
3. Bianca (the Agent) parses the intent, queries the IDs, and runs the `snc dispatch schedule` CLI commands in the background.
4. The Supabase database updates.
5. On James's screen, the Dashboard instantly flashes. The Cat 320 row moves, and a new Dispatch Event appears on the schedule for John Foley.
6. Bianca says in his ear: *"The Cat 320 is scheduled for transfer by John Foley tomorrow."*