# RUNBOOK — Wake Senior Living Intelligence Platform

Operator procedures for Sagar / Dusty. Copy-pasteable. All commands assume the
**Wake Intel** Supabase project:

- Project ref: `achrsfeajyvqqcrjcxvr` (name "33Health", **SHARED** — every object we own is `fe33_`-prefixed)
- Project URL: `https://achrsfeajyvqqcrjcxvr.supabase.co`

> Because the project is shared, **never** touch a table without the `fe33_` prefix, and
> always scope SQL with `where`/`eq` on a specific `id`. There is no separate staging DB.

### Set these in your shell first

```bash
export SUPABASE_URL="https://achrsfeajyvqqcrjcxvr.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key — from .env.local or Vercel env>"
```

The service-role key bypasses RLS. Keep it out of git, logs, and screenshots.

---

## 1. Manually trigger a monthly refresh

The refresh snapshots every facility, re-runs enrichment (parcel → therapy → site),
reclassifies size, marks PT matches no longer seen as `is_current=false`, runs the DHSR
import, and finally generates the Product A report. One row is written to
`fe33_monthly_runs`.

### Option A — in the app (preferred)

Sign in, go to the dashboard home, click **"Run monthly update"** (the refresh button
in the page header, `components/run-actions.tsx`). It POSTs `run-monthly-refresh` with
`{ "run_type": "full_refresh" }` using your signed-in token. **"Generate report"** next
to it re-runs just `generate-report`.

### Option B — curl with the service-role key

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/run-monthly-refresh" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"run_type":"full_refresh"}'
```

Response: `{ "status":"ok", "run_id":"…", "processed":N, "changed":N, "errors":N }`.
A full run is sequential and paced (~1s/facility plus enrichment), so allow a few
minutes. To regenerate only the report for a finished run:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/generate-report" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"monthly_run_id":"<run uuid>"}'
```

### Check the result

```sql
select id, run_type, status, started_at, finished_at,
       facilities_processed, facilities_changed, jsonb_array_length(errors) as error_count
from fe33_monthly_runs
order by started_at desc
limit 5;
```

`status` is `succeeded` (no errors), `partial` (some per-facility errors — see §6), or
`failed`. The app surfaces runs at `/reports`.

---

## 2. Add a new facility

### Option A — manual SQL insert

Only `name` is required; geography, operator, and size signals are normally filled by
enrichment. Set `size_class`/`size_confidence` only if you have a real source — otherwise
leave the defaults (`unknown`) and let classification handle it.

```sql
insert into fe33_facilities (name, address, city, zip, website_url, facility_type, county, state)
values ('New Community Name', '123 Main St', 'Cary', '27511',
        'https://example.com', 'ccrc', 'Wake', 'NC')
returning id;
```

Then enrich it (see §5 of the functions README for the confidence ladder: parcel +
therapy first, site last):

```bash
FID="<the returned uuid>"
for fn in enrich-parcel enrich-therapy-provider enrich-facility-site; do
  curl -sS -X POST "$SUPABASE_URL/functions/v1/$fn" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"facility_id\":\"$FID\"}"
done
# Reclassify size from the refreshed signals:
```
```sql
select fe33_classify_facility_size('<the uuid>');
```

`size_class` allowed values (CHECK constraint in migration 001):
`confirmed_100_plus`, `likely_100_plus`, `possible_100_plus`,
`likely_under_100`, `confirmed_under_100`, `unknown`.

### Option B — DHSR discovery via the review queue

`import-dhsr` (run as part of the monthly refresh, or on its own) pulls Wake-county
licensed AL/SN homes and **queues unknown 75+ bed homes** into `fe33_review_queue` with a
reason. Work them in the app at **/review**: approve (optionally set a size class), reject
(disqualifies — see §4), defer, or override. Note: DHSR does not license pure Independent
Living, so IL-only communities will not appear from this path — add those manually.

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/import-dhsr" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{}'
```

---

## 3. Override a size classification

### Option A — in the app

At **/review**, the resolve action "approve" or "override" writes the chosen `size_class`
onto the facility (see `app/actions.ts → resolveReview`).

### Option B — SQL

```sql
update fe33_facilities
set size_class = 'confirmed_100_plus',   -- must match the CHECK list (§2)
    size_confidence = 'high'
where id = '<facility uuid>';
```

The `fe33_audit_log` trigger records the before/after. Note: running
`fe33_classify_facility_size()` (or a monthly refresh) will recompute `size_class` from
signals and can overwrite a manual override — set `size_confidence='high'` and record the
reason in `internal_notes` so the basis is clear.

---

## 4. Disqualify a facility

```sql
update fe33_facilities
set ai_outreach_status = 'disqualified'
where id = '<facility uuid>';
```

`ai_outreach_status` allowed values: `not_contacted`, `contacted`, `demo_scheduled`,
`demo_done`, `proposal_sent`, `negotiating`, `won`, `lost`, `disqualified`. In the app,
rejecting a facility in **/review** sets this to `disqualified` automatically. The
nightly priority job and the monthly report exclude disqualified facilities from
priority outreach.

---

## 5. Roll back a bad enrichment run

Every facility is snapshotted to `fe33_facility_snapshots` (full row as `snapshot_data`
jsonb) **at the start** of each refresh, tagged with `monthly_run_id`. To restore a
facility to its pre-run state:

Inspect the snapshot first:

```sql
select id, monthly_run_id, created_at, snapshot_data
from fe33_facility_snapshots
where facility_id = '<facility uuid>'
order by created_at desc
limit 3;
```

Restore the scalar fields from the chosen snapshot:

```sql
update fe33_facilities f
set name              = s.snapshot_data->>'name',
    size_class        = s.snapshot_data->>'size_class',
    size_confidence   = s.snapshot_data->>'size_confidence',
    unit_count        = nullif(s.snapshot_data->>'unit_count','')::int,
    licensed_beds     = nullif(s.snapshot_data->>'licensed_beds','')::int,
    building_sqft     = nullif(s.snapshot_data->>'building_sqft','')::int,
    assessed_value    = nullif(s.snapshot_data->>'assessed_value','')::numeric,
    year_built        = nullif(s.snapshot_data->>'year_built','')::int,
    website_url       = s.snapshot_data->>'website_url'
from fe33_facility_snapshots s
where s.facility_id = f.id
  and s.id = '<snapshot uuid to restore>';
```

Add any other columns you need from `snapshot_data` (it is the full `fe33_facilities` row
as it existed before the run). To undo a whole bad run across all facilities, repeat per
facility using that run's `monthly_run_id`. CRM fields (`ai_*`, contacts, call notes) are
**not** changed by enrichment, so they do not need restoring.

---

## 6. Where the logs live

- **Edge Function logs** — Supabase Dashboard → project `achrsfeajyvqqcrjcxvr` →
  Edge Functions → pick the function (`run-monthly-refresh`, `generate-report`,
  `enrich-parcel`, `enrich-therapy-provider`, `enrich-facility-site`, `import-dhsr`) →
  Logs / Invocations. Start here for HTTP failures and stack traces.
- **Per-run errors** — `fe33_monthly_runs.errors` (jsonb array). Each element is either a
  per-facility `{facility_id, error}` or a step failure like `{step:"import-dhsr", ...}`.

```sql
select id, status, errors
from fe33_monthly_runs
where status in ('failed','partial')
order by started_at desc
limit 5;
```

- **Field-level change history** — `fe33_audit_log` (table_name, record_id, changed_fields,
  old/new values).

---

## 7. Reading PT market-status changes month-over-month (Product B)

The PT-intel layer lives in `fe33_facility_therapy_matches`. The key signal is
`is_current`: at the end of each refresh, any match whose `last_observed_at` predates the
run is flipped to `is_current=false` — that means the PT provider is no longer detected at
the facility (likely moved out). Newly observed matches keep `is_current=true` with their
original `first_observed_at`.

Two views compute the live picture (both restricted to 100+/possible-100+ facilities):

- **`fe33_v_facility_pt_summary`** — per facility, with a derived `pt_market_status`:
  - `open_market` — no current high/medium PT match (whitespace)
  - `single_incumbent` — exactly one current high-confidence match
  - `multi_provider` — more than one current high/medium match
  - `uncertain` — otherwise
- **`fe33_v_pt_provider_footprint`** — per provider: `active_facility_count`,
  `qualified_facility_count`, and the facility names they cover.

To see what changed this month, compare current matches against what existed before the
run (matches turned non-current this run = providers that left):

```sql
-- Providers that left a facility in the most recent run
select f.name as facility, tp.organization_name as provider, ftm.last_observed_at
from fe33_facility_therapy_matches ftm
join fe33_facilities f on f.id = ftm.facility_id
join fe33_therapy_providers tp on tp.id = ftm.provider_id
where ftm.is_current = false
order by ftm.last_observed_at desc;

-- New matches first seen this month
select f.name as facility, tp.organization_name as provider, ftm.first_observed_at
from fe33_facility_therapy_matches ftm
join fe33_facilities f on f.id = ftm.facility_id
join fe33_therapy_providers tp on tp.id = ftm.provider_id
where ftm.is_current = true
  and ftm.first_observed_at >= date_trunc('month', now())
order by ftm.first_observed_at desc;
```

The app surfaces all of this under **/pt-intel** (provider and facility detail pages).
Product B is dashboard-only — there is no PT email report.

---

## 8. Run the seed

Loads the initial roster from `scripts/seed-data/facilities.json` (idempotent — matches on
name, updates in place). Currently only the 3 spec-confirmed facilities (Searstone, The
Cardinal at North Hills, Wakefield Manor) are pre-populated; see
`scripts/seed-data/README.md` for how to extend to the full 30.

```bash
npm run seed
```

Requires `.env.local` populated (the seed uses the service-role admin client). On Node
< 22 a `ws` WebSocket polyfill is applied automatically (see DEPLOY.md / README.md).
