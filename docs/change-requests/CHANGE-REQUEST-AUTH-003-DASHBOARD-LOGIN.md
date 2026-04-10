# Change Request AUTH-003: Dashboard Login Page + JWT on All Queries

**Date:** 2026-04-07
**Status:** Pending — do not implement yet
**Depends on:** AUTH-001 (Supabase Auth enabled), AUTH-002 (RLS policies live)
**Note:** Must ship before AUTH-004 (CLI login flow), as it provides the /auth/callback redirect target.

---

## Problem

The dashboard currently loads all data using the anon key with no authentication. Once AUTH-002 enables RLS, unauthenticated requests will be blocked (or return empty rows, depending on the transitional public-read policy). The dashboard needs a login page so users can authenticate via Supabase Auth and have their JWT applied to all data queries.

## What to Build

### Login Page (`/login`)

A clean login form:
- Email + password fields
- "Sign In" button
- Calls `supabase.auth.signInWithPassword({ email, password })`
- On success: stores session, redirects to `/` (Overview)
- On failure: shows error message inline
- Matches the existing dark industrial aesthetic

### Auth Guard

A React context (`AuthContext`) that:
- Wraps the entire app
- Checks for an active Supabase session on load
- If no session → redirects to `/login`
- Listens to `supabase.auth.onAuthStateChange` and updates session state
- Exposes `user`, `role`, and `signOut()` to all components

### Session-Aware Supabase Client

The existing Supabase client (`src/lib/supabase.ts`) already uses the anon key. When a user signs in, Supabase JS automatically attaches the user JWT to all subsequent requests. No changes to individual views are needed — the session is applied globally.

### UI Changes

- **Header:** Add user email + role badge + "Sign Out" button in top-right corner
- **Sign Out:** Calls `supabase.auth.signOut()`, clears session, redirects to `/login`
- **Role-based UI hiding (optional for V1):** Admin-only actions (e.g., create business unit) can be conditionally hidden for `dispatcher` and `read_only` users — but since V1 is read-only from the dashboard anyway, this may not require any changes

### Auth Callback Page

The `/auth/callback` route needed by AUTH-003 (CLI login) is implemented in this CR since it lives in the dashboard codebase:
- Receives Supabase auth redirect with tokens in URL fragment
- Parses `access_token`, `refresh_token`, `expires_at`
- Reads `redirect_uri` from query params (the CLI's local server)
- POSTs tokens to `redirect_uri`
- Shows success message: "Authentication complete. You may close this tab."

## Files Changed

| Scope | Change |
|---|---|
| `src/pages/Login.tsx` | New login page component |
| `src/context/AuthContext.tsx` | New auth context with session management |
| `src/pages/AuthCallback.tsx` | New callback page for CLI OAuth2 flow |
| `src/App.tsx` | Add `/login` and `/auth/callback` routes; wrap app in AuthContext; add auth guard |
| `src/components/Header.tsx` | Add user info + sign out button |

## Validation

1. Open dashboard without a session → redirected to `/login`
2. Enter valid credentials → redirected to Overview with data loading correctly
3. Header shows correct email and role
4. Sign Out → session cleared, redirected to `/login`
5. `read_only` user sees all data but no admin UI elements
6. `dispatcher` user has same read access as admin (V1 dashboard is read-only anyway)
7. `/auth/callback` page correctly receives and forwards tokens for CLI flow (can be tested manually)
8. After session expires → redirected to `/login` automatically

## Notes

- The transitional public-read RLS policy (mentioned in AUTH-002 notes) can be removed once this CR ships. After AUTH-003, all dashboard clients will have a valid session.
- Password reset / "forgot password" flow is out of scope for V1 — use Supabase dashboard for account management.
- Google/OAuth SSO is out of scope for V1 — email/password only.
