// run-monthly-refresh — orchestrates the monthly data refresh across all facilities.
// Triggered by pg_cron (see supabase/cron/schedule.sql) or the UI "Run now" button.
//
// POST /functions/v1/run-monthly-refresh
//   body: { run_type?: 'full_refresh'|'manual', batch_size?: number, offset?: number }
//
// SCALING: with 31+ facilities, processing every facility (each fanning out to 3
// enrichment sub-functions that sleep internally) overruns the edge wall-clock limit
// in a single invocation. This function now processes ONE SLICE per call:
//   - It reuses/creates a single fe33_monthly_runs row keyed by offset===0.
//   - It returns { next_offset } so the caller (cron wrapper or UI) can re-invoke
//     with the next slice; next_offset is null once the final slice is done.
//   - The global tail work (DHSR import, stale-marking, run finalize, report) only
//     runs on the LAST slice.
// Per facility the 3 enrich sub-calls now fire CONCURRENTLY (Promise.all) to cut the
// per-facility wall-clock roughly to the slowest sub-call instead of their sum.
import { adminClient } from "../_shared/supabase.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const FN_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_BATCH_SIZE = 8;

async function callFn(name: string, body: unknown) {
  try {
    const res = await fetch(`${FN_BASE}/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SR}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    return { ok: false, status: 0, body: { error: String(e) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const reqBody = await req.json().catch(() => ({}));
  const runType = reqBody?.run_type ?? "full_refresh";
  const batchSize = Math.max(1, Number(reqBody?.batch_size) || DEFAULT_BATCH_SIZE);
  const offset = Math.max(0, Number(reqBody?.offset) || 0);

  const supabase = adminClient();
  const runStart = new Date().toISOString();

  // The monthly run row is created on the first slice (offset 0) and reused by later
  // slices. Later slices look up the most recent still-running row for this run_type.
  // run_id is passed explicitly by each slice's self-chain so all slices share one
  // run row (avoids the ambiguity of inferring "the most recent running row").
  const bodyRunId: string | undefined = reqBody?.run_id;
  let runId: string | undefined;
  if (offset === 0 || !bodyRunId) {
    const { data: run } = await supabase
      .from("fe33_monthly_runs")
      .insert({ run_type: runType, status: "running" })
      .select("id")
      .single();
    runId = run?.id;
  } else {
    runId = bodyRunId;
  }

  // Stable ordering so slices partition the set without overlap or gaps.
  const { data: allFacilities } = await supabase
    .from("fe33_facilities")
    .select("id")
    .order("created_at");

  const total = allFacilities?.length ?? 0;
  const slice = (allFacilities ?? []).slice(offset, offset + batchSize);
  const nextStart = offset + batchSize;
  const isLastSlice = nextStart >= total;
  const next_offset = isLastSlice ? null : nextStart;

  const errors: unknown[] = [];
  let processed = 0;
  let changed = 0;

  for (const f of slice) {
    try {
      // a. snapshot current state
      const { data: snap } = await supabase
        .from("fe33_facilities")
        .select("*")
        .eq("id", f.id)
        .single();
      await supabase.from("fe33_facility_snapshots").insert({
        facility_id: f.id,
        monthly_run_id: runId,
        snapshot_data: snap,
      });

      // b-d. enrichment — fire all three CONCURRENTLY. Each sub-function rate-limits
      // itself internally; running them in parallel cuts per-facility wall-clock to
      // the slowest of the three rather than their sum. callFn never throws (it
      // fail-soft-wraps), so Promise.all won't reject and abort the batch.
      await Promise.all([
        callFn("enrich-parcel", { facility_id: f.id }),
        callFn("enrich-therapy-provider", { facility_id: f.id }),
        callFn("enrich-facility-site", { facility_id: f.id }),
      ]);

      // e. reclassify size from the refreshed signals
      await supabase.rpc("fe33_classify_facility_size", { p_facility_id: f.id });

      // diff vs. previous snapshot
      const { data: diff } = await supabase.rpc("fe33_facility_diff_since_last", {
        p_facility_id: f.id,
      });
      if (diff && Object.keys(diff).length > 0) changed++;

      processed++;
    } catch (e) {
      errors.push({ facility_id: f.id, error: String(e) });
    }
  }

  // Tail work runs only on the final slice (or when there are zero facilities).
  if (isLastSlice) {
    // global DHSR import
    const dhsr = await callFn("import-dhsr", {});
    if (!dhsr.ok) errors.push({ step: "import-dhsr", ...dhsr });

    // PT matches not re-observed this run are no longer current (provider moved out).
    // Key off the run row's start so we don't void matches just-observed in earlier
    // slices of the same run.
    const { data: runRow } = await supabase
      .from("fe33_monthly_runs")
      .select("started_at")
      .eq("id", runId)
      .maybeSingle();
    const staleCutoff = runRow?.started_at ?? runStart;
    await supabase
      .from("fe33_facility_therapy_matches")
      .update({ is_current: false })
      .lt("last_observed_at", staleCutoff)
      .eq("is_current", true);

    // Accumulate this slice's counts onto whatever earlier slices recorded.
    const { data: prior } = await supabase
      .from("fe33_monthly_runs")
      .select("facilities_processed, facilities_changed, errors")
      .eq("id", runId)
      .maybeSingle();
    const priorErrors = Array.isArray(prior?.errors) ? prior!.errors : [];
    const allErrors = [...priorErrors, ...errors];
    await supabase
      .from("fe33_monthly_runs")
      .update({
        status: allErrors.length === 0 ? "succeeded" : "partial",
        finished_at: new Date().toISOString(),
        facilities_processed: (prior?.facilities_processed ?? 0) + processed,
        facilities_changed: (prior?.facilities_changed ?? 0) + changed,
        errors: allErrors,
      })
      .eq("id", runId);

    // Product A monthly report (Product B is dashboard-only — no report)
    await callFn("generate-report", { monthly_run_id: runId });
  } else {
    // Mid-run: persist running totals so the next slice can accumulate onto them.
    const { data: prior } = await supabase
      .from("fe33_monthly_runs")
      .select("facilities_processed, facilities_changed, errors")
      .eq("id", runId)
      .maybeSingle();
    const priorErrors = Array.isArray(prior?.errors) ? prior!.errors : [];
    await supabase
      .from("fe33_monthly_runs")
      .update({
        facilities_processed: (prior?.facilities_processed ?? 0) + processed,
        facilities_changed: (prior?.facilities_changed ?? 0) + changed,
        errors: [...priorErrors, ...errors],
      })
      .eq("id", runId);
  }

  // Self-chain: fire the next slice in the background so a single invocation (cron or
  // the UI button) cascades through the whole roster without any one call exceeding the
  // wall-clock limit. Pass run_id so every slice writes to the same run row.
  const ER = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (next_offset !== null && ER?.waitUntil) {
    ER.waitUntil(
      callFn("run-monthly-refresh", {
        run_type: runType,
        batch_size: batchSize,
        offset: next_offset,
        run_id: runId,
      }),
    );
  }

  return json({
    status: "ok",
    run_id: runId,
    offset,
    batch_size: batchSize,
    total,
    processed,
    changed,
    errors: errors.length,
    next_offset,
    done: isLastSlice,
  });
});
