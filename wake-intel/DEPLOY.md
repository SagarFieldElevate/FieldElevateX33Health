# DEPLOY — Wake Senior Living Intelligence Platform

Production deploy runbook. Frontend → **Vercel**; database + edge functions → **Supabase**
(hosted, project ref `achrsfeajyvqqcrjcxvr`, name "33Health", SHARED, `fe33_`-prefixed).

The Next.js 14 (App Router) app lives in the **`wake-intel/`** subdirectory of the repo —
set that as the Vercel Root Directory.

> **No-auth internal tool.** The login flow was removed. Every server-side read/write uses
> the Supabase **service-role key** (`lib/supabase/server.ts`, `lib/supabase/admin.ts`),
> which bypasses RLS. Those clients are only created in Server Components / Server Actions /
> Route Handlers and are never sent to the browser. There is no login page, no middleware,
> and no `/auth/callback`. `ALLOWED_EMAILS` no longer gates anything (see §2).

---

## What's already done vs what the deployer must do

**Already done on `achrsfeajyvqqcrjcxvr` (do NOT redo for the existing project):**

- Migrations **001–005 applied and verified** (`001_initial`, `002_size_classification`,
  `003_ai_pipeline`, `004_snapshot_diff`, `005_pt_entity_type`).
- `pg_cron` + `pg_net` enabled; `uuid-ossp` + `pgcrypto` present.
- All **six edge functions deployed** (`enrich-parcel`, `enrich-therapy-provider`,
  `enrich-facility-site`, `import-dhsr`, `run-monthly-refresh`, `generate-report`).
- **Cron jobs scheduled and active** (via Supabase Vault — `fe33-monthly-facility-refresh`
  and `fe33-nightly-ai-priorities`).
- `evidence` Storage bucket created.

**The deployer must do (this runbook):**

1. Create/connect the Vercel project, set Root Directory `wake-intel`, set Node 22 (§1).
2. Set the Vercel environment variables (§2).
3. Confirm the Supabase edge-function secrets for email (§2) — needed only when you want the
   monthly report to actually send.
4. Deploy and verify the build (§3).
5. Add the custom domain `wake-intel.fieldelevate.com` and DNS CNAME (§4).
6. (If standing up a **fresh** Supabase project instead of reusing the one above) reapply
   migrations / functions / cron — see §5.
7. Walk the post-deploy checklist (§6).

---

## 1. Create the Vercel project

1. Vercel → **Add New… → Project** → import the Git repo.
2. **Root Directory:** click **Edit** and set it to `wake-intel` (the app is a subdir of the
   repo — required, otherwise the build runs at repo root and fails).
3. **Framework Preset:** Next.js (auto-detected; `vercel.json` also pins `framework: nextjs`).
4. **Build / Install / Output:** leave defaults. With the Next.js preset, Vercel runs
   `next build`, detects npm from `package-lock.json`, and uses `.next`. Do not override
   these — `vercel.json` is intentionally minimal.

### Node.js version — set to 22

supabase-js v2 expects a global `WebSocket`. Node < 22 has none, so `lib/supabase/server.ts`,
`lib/supabase/admin.ts`, and `scripts/seed-facilities.ts` apply a guarded `ws` polyfill
(`if (!globalThis.WebSocket) globalThis.WebSocket = ws`). Two valid options:

- **Recommended:** Vercel → Project → **Settings → Build & Deployment → Node.js Version →
  22.x**. Node 22 ships a global `WebSocket`, so the polyfill guard is a no-op and `ws` is
  effectively unused at runtime.
- **Or:** keep the default Node version and rely on the `ws` polyfill (`ws` is already a
  dependency in `package.json`). This also works; no code change needed.

Either way the build output is identical. Pick one and be consistent. Node 22 is preferred.

---

## 2. Environment variables

### Vercel env vars (Project → Settings → Environment Variables — set for Production, and Preview if used)

| Variable | Value source | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://achrsfeajyvqqcrjcxvr.supabase.co` | Public. Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → `anon` `public` key | Public, browser-safe. Used by `lib/supabase/client.ts` and as the Bearer token in `components/run-actions.tsx` when invoking edge functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → `service_role` key | **Secret.** Powers every app read/write (no-auth) + the seed script. Bypasses RLS — server-only, never shipped to the browser. |

That's the complete Vercel runtime list — three variables. Everything else is either tooling
or a Supabase edge-function secret.

**Inert — do not bother setting in Vercel:** `ALLOWED_EMAILS` is no longer enforced anywhere
(auth was removed). It is read only by `app/(app)/settings/page.tsx` to display allowlist
status text. Leave it unset.

**Not used by the code — do not set:** `NPPES_BASE_URL` and `WAKE_PARCELS_BASE_URL` are
**hardcoded constants** inside the edge functions (`enrich-therapy-provider`,
`enrich-parcel`), not read from env. `APOLLO_API_KEY` and `APP_BASE_URL` are not referenced
anywhere in the current codebase.

**Tooling only (local, not Vercel):** `SUPABASE_ACCESS_TOKEN` (`sbp_…`) is used by the
Supabase CLI / Management API / MCP for migrations and deploys. Keep it in your local
`.env.local`; do not add it to Vercel.

### Supabase edge-function secrets (NOT Vercel envs)

These run **inside** the Supabase edge functions (Deno `Deno.env.get(...)`), so they must be
set as Supabase function secrets — not in Vercel. `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are auto-injected into functions by the Supabase runtime, so you
do NOT set those. The email vars for `generate-report`:

```bash
npx supabase secrets set \
  RESEND_API_KEY=re_… \
  REPORT_TO=keira@fieldelevate.com \
  REPORT_CC= \
  REPORT_FROM="Field Elevate Intel <intel@fieldelevate.com>" \
  --project-ref achrsfeajyvqqcrjcxvr
```

`generate-report` only sends mail when **both** `RESEND_API_KEY` and `REPORT_TO` are set;
otherwise it just returns the computed report JSON (safe to run pre-launch). Verify the
Resend sender domain (`fieldelevate.com`) is verified in Resend before relying on delivery.

---

## 3. Deploy and verify

1. Click **Deploy** (or push to the production branch). First build pulls deps and runs
   `next build` from the `wake-intel` root.
2. Confirm the build is green and the app loads at the Vercel-generated `*.vercel.app` URL.
3. Spot-check: dashboard renders facilities, the **Generate report** action runs, exports
   (`/api/exports/pt-intel`, `/api/exports/sales-pipeline`) return data. Data comes straight
   from `achrsfeajyvqqcrjcxvr` via the service-role client.

---

## 4. Custom domain — `wake-intel.fieldelevate.com`

1. Vercel → Project → **Settings → Domains → Add** → enter `wake-intel.fieldelevate.com`.
2. Vercel shows a **CNAME** target (typically `cname.vercel-dns.com`). In the DNS provider
   for `fieldelevate.com`, add:
   - **Type:** CNAME
   - **Name / Host:** `wake-intel`
   - **Value / Target:** the value Vercel displays (e.g. `cname.vercel-dns.com`)
   - **TTL:** default / auto
3. Back in Vercel, wait for the domain to show **Valid Configuration** (DNS propagation can
   take minutes to a couple of hours). Vercel auto-provisions the TLS cert.
4. No Supabase Auth redirect/URL config is needed — there is no login flow or auth callback
   in this app.

> If you want the bare project URL to redirect to the custom domain, set
> `wake-intel.fieldelevate.com` as the **Production domain** in Vercel.

---

## 5. Standing up a FRESH Supabase project (only if NOT reusing `achrsfeajyvqqcrjcxvr`)

Skip this entire section for the existing project — it is already provisioned (see "What's
already done"). For a brand-new project:

**Migrations (001–005):**
- **SQL editor:** Dashboard → SQL Editor → paste the contents of each
  `supabase/migrations/00x_*.sql` in order (001 → 005) and run.
- **CLI:** the files use numeric prefixes; `supabase db push` wants timestamp prefixes, so
  either paste in order or rename before:
  ```bash
  npx supabase link --project-ref <NEW_REF>
  npx supabase db push
  ```
- Extensions: `uuid-ossp` + `pgcrypto` are created by the schema. **Enable `pg_cron` and
  `pg_net` manually** (Dashboard → Database → Extensions) before applying cron.

**Edge functions (six):**
```bash
for fn in enrich-parcel enrich-therapy-provider enrich-facility-site \
          import-dhsr run-monthly-refresh generate-report; do
  npx supabase functions deploy "$fn" --project-ref <NEW_REF>
done
```
Then set the email secrets (§2) and create a Storage bucket named **`evidence`**
(`enrich-facility-site` writes HTML evidence there; uploads fail soft if missing).

**Cron (`supabase/cron/schedule.sql`):** apply **last**, after pg_cron + pg_net are enabled
and functions are deployed. The live jobs read the service-role key from **Supabase Vault**
(secret `app.service_role_key`); create that Vault secret first, then paste
`supabase/cron/schedule.sql` in the SQL editor. It registers:
- `fe33-monthly-facility-refresh` — `0 3 1 * *` (03:00 UTC on the 1st) → POSTs
  `run-monthly-refresh`.
- `fe33-nightly-ai-priorities` — `0 8 * * *` (08:00 UTC nightly) → `fe33_recompute_ai_priorities()`.

Verify with `select * from cron.job;`. (If you have superuser/dashboard access you may
instead `alter database postgres set app.service_role_key = '…'` and swap the cron
Authorization line to `current_setting('app.service_role_key')` — see the comments in
`schedule.sql`.)

**Seed:** load facility data with `npm run seed` (needs `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`).

---

## 6. Post-deploy checklist

- [ ] Vercel project Root Directory = `wake-intel`; Node version = 22 (or polyfill path).
- [ ] Three Vercel env vars set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Build green; app loads on the `*.vercel.app` URL; facilities visible.
- [ ] (Email) Resend secrets set as **Supabase function secrets**; sender domain verified;
      test report delivered (or intentionally left unsent pre-launch).
- [ ] Reusing `achrsfeajyvqqcrjcxvr`: migrations 001–005, `pg_cron`/`pg_net`, six functions,
      `evidence` bucket, and both cron jobs are already in place — confirm
      `select * from cron.job;` shows them.
- [ ] Custom domain `wake-intel.fieldelevate.com` shows **Valid Configuration** with TLS.
- [ ] No login expected — direct access works (no-auth internal tool).

---

## Appendix — local dev: move off OneDrive

For local development, the repo currently lives under a OneDrive-synced path
(`…/OneDrive/Desktop/…`). OneDrive's background sync can lock files, corrupt `.next`, and
cause flaky `next dev` rebuilds (and slow `node_modules` I/O). For reliability, clone/move
the project to a non-synced local path, e.g. `~/dev/wake-intel` (or a WSL-native path like
`~/projects/wake-intel`), and run the dev server from there. This does not affect Vercel,
which builds from Git. If you keep it on OneDrive, at minimum exclude the project folder (or
at least `node_modules` and `.next`) from OneDrive sync.
