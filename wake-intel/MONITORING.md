# MONITORING — Wake Senior Living Intelligence Platform

Minimal monitoring per build spec §8.4. **None of this is built yet** — these are setup
steps / TODOs. The signals all already exist in the schema; what's missing is the
alerting glue.

Project: `achrsfeajyvqqcrjcxvr` (SHARED, `fe33_`-prefixed).

---

## 1. Email Sagar on a failed monthly run (priority)

**Signal:** `fe33_monthly_runs.status` becomes `failed` (or `partial`, with a non-empty
`errors` jsonb array) — written at the end of `run-monthly-refresh`.

**TODO — implement one of:**

- **Extend `run-monthly-refresh`** to send a Resend email when
  `status !== 'succeeded'`, reusing the `RESEND_API_KEY` already configured for the report.
  Send to a new `ALERT_TO` (or reuse `REPORT_TO`). Simplest, since the run already knows
  its own outcome and error list.
- **Or a scheduled checker** (pg_cron, hourly) that queries for recent failed/partial runs
  and POSTs an alert. Example query the checker would run:

  ```sql
  select id, status, started_at, jsonb_array_length(errors) as error_count
  from fe33_monthly_runs
  where status in ('failed','partial')
    and started_at > now() - interval '25 hours';
  ```

Recipient: Sagar (`team@fieldelevate.com` / Sagar's address). Include `run_id`, status,
and the first few `errors` entries.

---

## 2. Optional Slack webhook — new facility / PT-provider changes

**Signals:**

- New facility: a fresh row in `fe33_facilities` (or `fe33_monthly_runs.new_facilities_added > 0`),
  and items added to `fe33_review_queue` by `import-dhsr`.
- PT-provider change: rows in `fe33_facility_therapy_matches` flipping to `is_current=false`
  (provider left) or new matches with a recent `first_observed_at` (provider arrived);
  also `fe33_monthly_runs.pt_provider_changes`.

**TODO:**

1. Create an incoming webhook in Slack; store the URL as a function secret
   `SLACK_WEBHOOK_URL` (`supabase secrets set SLACK_WEBHOOK_URL=… --project-ref achrsfeajyvqqcrjcxvr`).
2. At the end of `run-monthly-refresh`, if `new_facilities_added` or `pt_provider_changes`
   is non-zero, POST a summary to the webhook (counts + facility/provider names). Keep it a
   digest, not one message per change.

Optional / nice-to-have, not required for launch.

---

## 3. Weekly review-queue summary if > 10 open

**Signal:** open items in `fe33_review_queue`.

```sql
select count(*) as open_items
from fe33_review_queue
where status = 'open';
```

**TODO:** add a weekly pg_cron job (alongside the jobs in `supabase/cron/schedule.sql`)
that runs the count and, **only if > 10**, emails/Slacks a nudge to clear the queue at
`/review`. Sketch:

```sql
select cron.schedule(
  'fe33-weekly-review-queue-summary',
  '0 14 * * 1',  -- Mondays 14:00 UTC
  $$
  -- pseudo: if (select count(*) from fe33_review_queue where status='open') > 10
  -- then net.http_post(...) to an alert endpoint / Slack webhook
  $$
);
```

(Implement the count-gate and the actual POST when the alerting endpoint exists.)

---

## What already exists to build on

- `fe33_monthly_runs` — status, `errors` jsonb, `facilities_processed/changed`,
  `new_facilities_added`, `pt_provider_changes`.
- `fe33_review_queue` — `status in ('open','approved','rejected','deferred')`.
- `fe33_facility_therapy_matches.is_current` / `first_observed_at` / `last_observed_at`.
- `RESEND_API_KEY` (report email) — reusable for alert email.
- pg_cron + pg_net (once enabled) for scheduled checks.
- Supabase Dashboard → Edge Functions logs for raw failures.
