# Change Request: ENV-002 — Vercel Production Deployment

**Project:** SNC Equipment Tracking  
**Date:** 2026-04-07  
**Status:** DRAFT  
**Implemented by:** Manual (Vercel dashboard configuration — no code changes required)  
**Depends on:** SETUP-PRODUCTION-ENVIRONMENT.md, ENV-001

---

## Problem

The dashboard currently has one Vercel deployment (`snc-dashboard.vercel.app`) pointing at the demo Supabase project. There is no production deployment for real SNC operations.

---

## Solution

Create a second Vercel deployment from the same `snc-dashboard` GitHub repo, pointed at the production Supabase project. No code changes are required — the dashboard already reads Supabase credentials from environment variables. The two deployments differ only in their env vars.

---

## No Code Changes

The dashboard is already environment-agnostic. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are read from env vars at build time (Vite). Providing different values to a different Vercel project is sufficient.

---

## Steps (Manual — Vercel Dashboard)

### 1. Create New Vercel Project

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **Add New → Project**
3. Import the **same `snc-dashboard` GitHub repo** (do not create a new repo)
4. Project name: `snc-dashboard-prod` (or `snc-production` — choose a name that makes the environment clear)
5. Framework: Vite (auto-detected)
6. **Do not deploy yet** — set env vars first

### 2. Set Production Environment Variables

In the new project's Settings → Environment Variables, add:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | Production Supabase URL (`https://[prod-ref].supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Production anon key |

### 3. Deploy

Trigger the first deployment. Vercel builds from the main branch of `snc-dashboard`.

### 4. Configure Domain (Optional)

If SNC has a domain or subdomain:
- `snc.sierranevadaconstruction.com` → production deployment
- `snc-demo.vercel.app` → demo deployment (existing, unchanged)

Otherwise, Vercel's generated URL (`snc-dashboard-prod.vercel.app`) is fine for now.

### 5. Auto-Deploy Behavior

Both Vercel deployments auto-deploy from the same `snc-dashboard` GitHub repo main branch. When a commit is pushed to main, both demo and production deployments rebuild automatically. No additional configuration needed — this is Vercel's default behavior for multiple projects from the same repo.

---

## Result

| Deployment | URL | Supabase Project | Data |
|------------|-----|-----------------|------|
| Demo | `snc-dashboard.vercel.app` | snc-demo | Sample equipment, fake Reno coordinates |
| Production | `snc-dashboard-prod.vercel.app` | snc-production | Real SNC equipment (after HCSS sync) |

---

## Verification Steps

1. Open the production Vercel deployment URL
2. Login page appears
3. Log in with `james@amplifyluxury.com` / `poi99999`
4. Dashboard loads — equipment table is empty (expected, HCSS sync not yet run)
5. Admin page loads, shows the three configured users
6. Open demo deployment in a second tab — still shows sample equipment, unaffected

---

## Out of Scope

- Custom domain setup (can be done later)
- Separate Vercel teams or orgs (not needed)
- Any code changes (this CR is configuration-only)

