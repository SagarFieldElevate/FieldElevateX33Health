# Seed data

`facilities.json` is the initial facility roster loaded by `npm run seed`.

## Current state

Only the **3 facilities with confirmed unit counts** from the build spec (§1.5) are
pre-populated, with strictly spec-backed fields:

| Facility                     | Units | size_class            |
| ---------------------------- | ----- | --------------------- |
| Searstone                    | 321   | confirmed_100_plus    |
| The Cardinal at North Hills  | 191   | confirmed_100_plus    |
| Wakefield Manor              | 96    | confirmed_under_100   |

Geography (address/city/zip), operator, and ownership are intentionally left blank —
they are filled by Phase 2 enrichment (Wake parcels) or by the Codex roster, not invented here.

## To load the full 30

The complete Wake County 100+ unit roster lives in the companion document
`NC_Wake_Senior_Living_Tracker_Codex_Report.pdf` (spec §0.4, §4). That PDF is **not in
this repo yet**. To finish the Phase 1 seed:

1. Add the PDF to `docs/`.
2. Append each facility to `facilities.json` as an object. Supported fields:
   `name` (required), `address`, `city`, `zip`, `operator`, `ownership_type`,
   `facility_type`, `unit_count`, `unit_count_type`, `size_class`, `size_confidence`,
   `licensed_beds`, `website_url`.
3. Re-run `npm run seed` (idempotent — matches on name, updates in place).

`size_class` and `size_confidence` values must match the CHECK constraints in
`supabase/migrations/001_initial.sql`.
