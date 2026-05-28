# Wake Senior Living Intelligence Platform

Two products on one shared data foundation for Wake County (NC) senior-living
communities. **Product A — Field Elevate AI sales:** a CRM/pipeline layer (priority
scoring, contacts, call notes, follow-ups, a monthly email report) for selling AI ops
software to 100+ unit communities. **Product B — PT market intel:** a live dashboard of
which physical-therapy providers operate inside which facilities (footprint, market
status: open / single-incumbent / multi-provider). Both read the same facility roster,
enriched monthly from Wake County parcels, NPPES NPI data, NC DHSR licensing, and facility
websites.

## `fe33_` namespacing — important

The Supabase project (`achrsfeajyvqqcrjcxvr`, name "33Health") is **SHARED**. Every object
this app owns — tables, views, functions, triggers — is prefixed `fe33_`. Never read or
write a non-`fe33_` object, and always scope SQL to specific rows.

## Stack

- **Next.js 14.2** (App Router, React 18) on Vercel
- **Tailwind CSS v3** + Radix primitives (shadcn-style `components/ui`)
- **Supabase** — Postgres (RLS, triggers, views, plpgsql functions), Auth, Storage
  (`evidence` bucket), and **Deno edge functions** for enrichment/refresh/report
- **pg_cron + pg_net** for the monthly refresh and nightly priority scoring
- **Resend** for the monthly report email; **Apollo** (optional) for contact discovery
- supabase-js v2 (with a `ws` WebSocket polyfill on Node < 22)

## Directory layout

```
wake-intel/
├── app/                 # Next App Router: (app) dashboard, /login, /auth, /api exports
│   ├── (app)/           # authed UI: home, /review, /pt-intel, /reports, /follow-ups, /facility/[id], /settings
│   ├── actions.ts       # server actions (log call, resolve review, mark follow-up)
│   └── api/exports/     # CSV exports (pt-intel, sales-pipeline)
├── components/          # UI + run-actions (Run monthly update / Generate report buttons)
├── lib/                 # supabase clients (client/server/admin), queries, domain, types, csv
├── scripts/             # seed-facilities.ts + seed-data/ (facilities.json roster)
├── supabase/
│   ├── migrations/      # 001_initial · 002_size_classification · 003_ai_pipeline · 004_snapshot_diff
│   ├── fe33_setup.sql   # consolidated schema (paste-and-run)
│   ├── cron/schedule.sql# pg_cron jobs (apply last)
│   └── functions/       # edge fns: enrich-parcel, enrich-therapy-provider, enrich-facility-site,
│                        #           import-dhsr, run-monthly-refresh, generate-report
├── docs/                # WAKE_INTEL_BUILD_SPEC_v2.md (the build spec)
├── RUNBOOK.md           # operator procedures (Sagar/Dusty)
├── DEPLOY.md            # Vercel + Supabase deployment guide
└── MONITORING.md        # alerting setup / TODOs
```

## Setup

1. **Env:** `cp .env.local.example .env.local` and fill in the Supabase URL, anon key,
   service-role key, and the optional source/report keys. See DEPLOY.md §2 for the full
   list (including `REPORT_TO`/`REPORT_CC`/`REPORT_FROM`).
2. **Migrations:** paste `supabase/fe33_setup.sql` into the Supabase SQL editor, or
   `supabase db push`. (001–004 are already applied to `achrsfeajyvqqcrjcxvr`.) Enable the
   `pg_cron` and `pg_net` extensions for the monthly refresh.
3. **Seed:** `npm run seed` (idempotent; currently the 3 spec-confirmed facilities — see
   `scripts/seed-data/README.md` to extend to the full 30).
4. **Dev:** `npm run dev` → http://localhost:3000.

## npm scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | `next build` (production build) |
| `npm run start` | Serve the production build |
| `npm run lint` | `next lint` |
| `npm run seed` | Load/refresh the facility roster from `scripts/seed-data/facilities.json` |

## Node / WebSocket note

supabase-js v2 expects a global `WebSocket`. On Node < 22 (the local dev default here is
Node 20) a guarded `ws` polyfill is applied in `lib/supabase/server.ts`,
`lib/supabase/admin.ts`, and `scripts/seed-facilities.ts`. On Vercel, set the Node.js
version to 22 (polyfill becomes a no-op) **or** keep the polyfill — both are valid. See
DEPLOY.md §1.

## Current build status

- Schema migrations **001–004 applied and verified** on `achrsfeajyvqqcrjcxvr`.
- Six edge functions written (`enrich-parcel`, `enrich-therapy-provider`,
  `enrich-facility-site`, `import-dhsr`, `run-monthly-refresh`, `generate-report`).
- App through **Phase 3**: dashboard, review queue, PT-intel views, reports, follow-ups,
  call logging, CSV exports, email allowlist auth.
- Seed currently loads **3 of 30** facilities (Searstone, The Cardinal at North Hills,
  Wakefield Manor); full roster pending the Codex report PDF.
- External-source field mappings (Wake parcel attributes, DHSR workbook columns) were
  written from the spec and **should be verified against live sources** — see
  `supabase/functions/README.md`.

## Docs

- **[RUNBOOK.md](./RUNBOOK.md)** — manual refresh, add/override/disqualify facilities,
  roll back a run, where logs live, reading PT month-over-month changes.
- **[DEPLOY.md](./DEPLOY.md)** — Vercel + Supabase deployment, env vars, migrations, edge
  functions, cron, domain, Resend.
- **[MONITORING.md](./MONITORING.md)** — alerting setup / TODOs.
- **[docs/WAKE_INTEL_BUILD_SPEC_v2.md](./docs/WAKE_INTEL_BUILD_SPEC_v2.md)** — full build spec.
