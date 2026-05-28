-- ============================================================
-- Phase 5 — pg_cron schedules (apply LAST, manually)
--
-- Prerequisites (not done automatically):
--   1. Enable extensions: Dashboard > Database > Extensions → pg_cron, pg_net
--   2. Deploy the edge functions (run-monthly-refresh, generate-report, enrich-*)
--   3. Store the service-role key so cron can authenticate. NOTE: the Management API
--      PAT canNOT set a database GUC (permission denied), so the LIVE jobs use Supabase
--      Vault — secret named 'app.service_role_key' — read via vault.decrypted_secrets
--      (see the monthly job below). If you have dashboard/superuser access you may instead
--      `alter database postgres set app.service_role_key = '...'` and swap the Authorization
--      line back to current_setting('app.service_role_key').
--
-- STATUS: already enabled + scheduled + active on achrsfeajyvqqcrjcxvr (via Vault).
-- Project ref: achrsfeajyvqqcrjcxvr
-- ============================================================

-- Monthly full refresh — 03:00 UTC on the 1st.
select cron.schedule(
  'fe33-monthly-facility-refresh',
  '0 3 1 * *',
  $$
  select net.http_post(
    url := 'https://achrsfeajyvqqcrjcxvr.supabase.co/functions/v1/run-monthly-refresh',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('run_type', 'full_refresh')
  );
  $$
);

-- Nightly — recompute AI priorities at 08:00 UTC.
select cron.schedule(
  'fe33-nightly-ai-priorities',
  '0 8 * * *',
  $$ select fe33_recompute_ai_priorities(); $$
);

-- To remove later:
--   select cron.unschedule('fe33-monthly-facility-refresh');
--   select cron.unschedule('fe33-nightly-ai-priorities');
