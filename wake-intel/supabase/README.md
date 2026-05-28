# Supabase

Targets project **`achrsfeajyvqqcrjcxvr`** ("33Health"), a **shared** project. Every object
we create is prefixed **`fe33_`** and lives alongside unrelated clinic/payroll tables that
must never be touched.

## Migrations (all applied + verified live)

- `migrations/001_initial.sql` — Phase 1 schema: 11 tables, indexes, the two PT-intel views,
  RLS policies, `updated_at` + `audit_log` triggers.
- `migrations/002_size_classification.sql` — Phase 2: `fe33_classify_facility_size()` + the
  partial unique index for review-queue dedup.
- `migrations/003_ai_pipeline.sql` — Phase 3: `fe33_trg_rollup_ai_outreach` + `fe33_recompute_ai_priorities()`.
- `migrations/004_snapshot_diff.sql` — Phase 5: `fe33_facility_diff_since_last()`.
- `migrations/005_pt_entity_type.sql` — Product B: `fe33_therapy_providers.entity_type`
  (organization|individual) + the two PT views rebuilt to count only PT *companies*.
- `fe33_setup.sql` — consolidated 001–004 for a single paste.
- `cron/schedule.sql` — Phase 5 pg_cron jobs (see note below — the live jobs read the
  service-role key from **Supabase Vault**, not a GUC).

## Applying the schema

`.env.local` is already pointed at the project. To (re)apply, use any of:

- **Management API** (used to apply these): `POST https://api.supabase.com/v1/projects/achrsfeajyvqqcrjcxvr/database/query`
  with `{"query":"..."}` and `Authorization: Bearer $SUPABASE_ACCESS_TOKEN` — via **curl** (urllib is Cloudflare-blocked).
- **Dashboard SQL editor** — paste `fe33_setup.sql`.
- **CLI** — `npx supabase db push` (rename migrations to timestamp prefixes for that workflow).

## Seeding

```bash
npm run seed   # idempotent; also emits official_unit_count signals for exact counts
```
3 confirmed facilities are seeded. Researched candidates for the rest are in
`../scripts/seed-data/researched-candidates.json` (review before promoting into `facilities.json`).

## Extensions — ENABLED

`uuid-ossp`, `pgcrypto` (by migration), plus **`pg_cron`** and **`pg_net`** (enabled for Phase 5 cron).

## Cron — SCHEDULED

Two jobs are registered and active in `cron.job`:
- `fe33-monthly-facility-refresh` — `0 3 1 * *` → POSTs to `run-monthly-refresh`.
- `fe33-nightly-ai-priorities` — `0 8 * * *` → `fe33_recompute_ai_priorities()`.

The service-role key is stored in **Supabase Vault** (secret `app.service_role_key`) because
the Management API PAT can't set a database GUC; the monthly job reads it via
`vault.decrypted_secrets`. To rotate the key, update that Vault secret — no re-scheduling needed.

## Edge Functions — DEPLOYED

All 6 are live on the project: `enrich-parcel`, `enrich-therapy-provider`,
`enrich-facility-site`, `import-dhsr`, `run-monthly-refresh`, `generate-report`. See
`functions/README.md`. Storage bucket **`fe33_evidence`** (private) exists for site-scrape evidence.
