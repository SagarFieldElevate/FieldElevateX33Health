# Edge Functions

Deno functions, **DEPLOYED to project achrsfeajyvqqcrjcxvr** (all 6). They run under the
Supabase Edge runtime and are **excluded from the Next.js TypeScript build**
(`tsconfig.json` → `exclude`), so editor errors about `Deno` or `https://` imports
outside this folder are expected.

`enrich-parcel` and `import-dhsr` were verified/corrected against the live sources
(real Wake parcel fields: `HEATEDAREA`, `TOTAL_VALUE_ASSD`, `CALC_AREA`, `REID`; real
DHSR files: `Ahlist.xlsx` + `nhlist_co.xlsx` with multi-row header offsets). NPPES shape
confirmed. The `run-monthly-refresh` orchestrator and `generate-report` are also live.

| Function                   | Trigger / body            | Source            | What it does |
| -------------------------- | ------------------------- | ----------------- | ------------ |
| `enrich-parcel`            | `{ facility_id }`         | Wake ArcGIS       | sqft, year built, assessed value, use code, acreage, PIN → updates facility + size signal |
| `enrich-therapy-provider`  | `{ facility_id }`         | NPPES NPI v2.1    | finds PT/OT/rehab NPIs at the facility address → upserts `therapy_providers` + `facility_therapy_matches` (Product B) |
| `enrich-facility-site`     | `{ facility_id }`         | facility website  | scrapes unit counts + named PT providers, stores HTML evidence, upgrades match confidence to `high` |
| `import-dhsr`              | `{}`                      | NC DHSR XLSX      | monthly: Wake-county licensed beds → updates facilities, queues unknown 75+ bed homes |

`_shared/` holds the service-role client, CORS helpers, and address normalization.

## Run locally

```bash
supabase functions serve --env-file ./supabase/functions/.env
# then:
curl -X POST http://localhost:54321/functions/v1/enrich-parcel \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"facility_id":"<uuid>"}'
```

## Deploy (once a project is linked — NOT supabase-33health)

```bash
supabase functions deploy enrich-parcel
supabase functions deploy enrich-therapy-provider
supabase functions deploy enrich-facility-site
supabase functions deploy import-dhsr
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the runtime.

## ⚠ Must verify against live sources before trusting output

These were written without live API access and encode assumptions from the build spec:

- **`enrich-parcel`** — the Wake parcel attribute names (`SITE_ADDRESS`, `HEATED_AREA`,
  `TOTAL_VALUE`, `YEAR_BUILT`, `LAND_CLASS`, `ACREAGE`, `PIN_NUM`) are hoisted into a
  `FIELD` map at the top of the file. Confirm them with:
  `…/MapServer/0/query?where=1=1&outFields=*&resultRecordCount=1&f=json`
- **`enrich-facility-site`** — requires a Storage bucket named `evidence` (create it; the
  upload fails soft if missing). Regexes are heuristic.
- **`import-dhsr`** — the listings page (`info.ncdhhs.gov/dhsr/ahc/listings.html`) link
  structure and workbook column names (`COLS` map) are assumptions. DHSR does **not**
  license pure independent living, so IL communities won't appear here.

## Dependencies between functions

Confidence ladder for PT matches: `enrich-therapy-provider` sets `medium` (same-address
NPI); `enrich-facility-site` upgrades to `high` when the facility's own site names the
provider. Run parcel + therapy first, site last. `classify_facility_size` (migration 002)
should run after enrichment to set `size_class`.
