# Change Request PERM-002: Admin Dashboard Page — User Permission Management

**Date:** 2026-04-07
**Status:** Pending — do not implement yet
**Depends on:** PERM-001 (permissions JSONB column must exist on user_profiles)

---

## Problem

There is no UI to manage user permissions. Currently they can only be set via SQL. We need an admin-only page in the dashboard where James can see all users and configure their allowed operations via a checkbox grid that mirrors the CLI command tree.

---

## What to Build

### New Route: `/admin`

Visible only when the logged-in user's role is `admin`. All other users see a 403 / redirect to Overview.

### Page Layout

**Header:** "User Management" with a "Create User" button (future scope — not in this CR, placeholder only).

**User list:** One card per user in `user_profiles`, showing:
- Email address
- Role badge (admin / dispatcher / agent_write / agent_read / read_only)
- Expandable permission grid (collapsed by default, click to expand)

### Permission Grid

For each user card, the expanded view shows a table matching the CLI command tree exactly:

| Resource | list | get | create | update | delete | (operation-specific) |
|---|---|---|---|---|---|---|
| business-unit | ☑ | ☑ | ☐ | ☐ | ☐ | — |
| equipment | ☑ | ☑ | ☐ | ☑ | ☐ | transfer ☐ |
| dispatch | ☑ | ☑ | — | — | — | schedule ☑, cancel ☐ |
| job | ☑ | ☑ | ☐ | ☐ | ☐ | — |
| location | ☑ | ☑ | ☐ | ☐ | ☐ | — |
| employee | ☑ | ☑ | ☐ | ☐ | ☐ | — |
| crew-assignment | ☑ | ☑ | — | — | — | assign ☐, remove ☐ |
| telemetry | — | — | — | — | — | update ☐ |

Checkboxes are checked/unchecked based on the user's `permissions` JSONB. Changing a checkbox immediately updates the permissions JSONB via a Supabase `PATCH` on `user_profiles`. No save button — immediate write-through.

### Visual Design

- Matches existing dark industrial aesthetic (slate gray, safety orange)
- Role badge colors: admin → red, dispatcher → orange, agent_write → blue, agent_read → gray
- Checked operations shown with green checkmark; unchecked grayed out
- Sidebar nav item "Admin" visible only to admin users (conditionally rendered based on AuthContext role)

---

## Files Changed

| Scope | Change |
|---|---|
| `src/pages/Admin.tsx` | New admin page with user list + permission grid |
| `src/App.tsx` | Add `/admin` route; redirect non-admin users to Overview |
| `src/components/Layout.tsx` | Add "Admin" sidebar nav item, visible only when role = admin |

---

## Instructions for Claude Code

1. Read `src/context/AuthContext.tsx` to understand how role is exposed
2. Read `src/views/Equipment.tsx` or similar for the data fetch + Supabase pattern to follow
3. The permission grid checkboxes should update `user_profiles.permissions` via:
   ```typescript
   supabase.from('user_profiles').update({ permissions: updatedPermissions }).eq('id', userId)
   ```
4. Fetch all users from `user_profiles` using the admin JWT (RLS allows admin to read all rows)
5. Use the existing Tailwind v4 classes for dark mode — match the visual style of other views
6. `npm run build` must pass with zero TypeScript errors

---

## Validation

1. Log in as `james@amplifyluxury.com` (admin) → "Admin" appears in sidebar nav
2. Click Admin → user list shows all three users with role badges
3. Expand `agent-write@snc.app` → permission grid shows current permissions from JSONB
4. Uncheck `dispatch → schedule` → immediately reflected in database
5. Log in as `agent-write@snc.app` → `snc dispatch schedule` now returns permission error
6. Re-check `dispatch → schedule` in admin UI → `snc dispatch schedule` works again
7. Log in as `agent-read@snc.app` → "Admin" not visible in sidebar; navigating to `/admin` redirects to Overview

## Notes

- "Create User" button is a placeholder only in this CR — actual user creation goes via Supabase Auth admin API and is a future CR
- Admin users always have all permissions regardless of their JSONB — the admin override in `can_perform()` ensures this; the admin's own permission grid is display-only
