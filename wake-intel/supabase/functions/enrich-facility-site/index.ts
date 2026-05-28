// enrich-facility-site — scrape a facility's own website for unit-count language
// and named PT providers. Most fragile source; fails soft on every page.
//
// POST /functions/v1/enrich-facility-site   body: { facility_id: uuid }
import { adminClient } from "../_shared/supabase.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUBPATHS = [
  "",
  "/floor-plans",
  "/residences",
  "/amenities",
  "/services",
  "/about",
  "/health-services",
];

const UNIT_RE = /(\d{2,4})\s+(units?|apartments?|residences|homes?|suites)/i;
const PT_MENTION_RE =
  /(on-?site|in-house|partner|contracted)\s+(physical|occupational)\s+therapy/i;
const NAMED_PROVIDER_RE =
  /WakeMed|Genesis Rehab|Aegis Therapies|Fox Rehabilitation|Reliant Rehab|Encompass Health|Powerback/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let facility_id: string | undefined;
  try {
    ({ facility_id } = await req.json());
  } catch {
    return json({ error: "invalid_json_body" }, 400);
  }
  if (!facility_id) return json({ error: "facility_id_required" }, 400);

  const supabase = adminClient();

  const { data: facility, error: fErr } = await supabase
    .from("fe33_facilities")
    .select("id, website_url")
    .eq("id", facility_id)
    .single();

  if (fErr || !facility) return json({ error: "facility_not_found" }, 404);
  if (!facility.website_url) return json({ status: "no_website" });

  const base = facility.website_url.replace(/\/+$/, "");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const findings = {
    unit_count: null as number | null,
    pt_mention: false,
    named_providers: [] as string[],
    pages_fetched: 0,
    pages_blocked: 0,
  };

  for (const path of SUBPATHS) {
    const url = `${base}${path}`;
    let html = "";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "WakeIntelBot/1.0 (+facility enrichment)" },
        redirect: "follow",
      });
      if (!res.ok) {
        findings.pages_blocked++;
        await supabase.from("fe33_facility_sources").insert({
          facility_id,
          source_type: "facility_site",
          source_url: url,
          notes: `http_${res.status}`,
        });
        await sleep(1000);
        continue;
      }
      html = await res.text();
    } catch (e) {
      findings.pages_blocked++;
      await supabase.from("fe33_facility_sources").insert({
        facility_id,
        source_type: "facility_site",
        source_url: url,
        notes: `fetch_failed: ${String(e)}`,
      });
      await sleep(1000);
      continue;
    }

    findings.pages_fetched++;

    // Persist raw HTML to the evidence bucket (best-effort; ignore if missing).
    await supabase.storage
      .from("fe33_evidence")
      .upload(`${facility_id}/${ts}${path.replace(/\//g, "_") || "_home"}.html`, html, {
        contentType: "text/html",
        upsert: true,
      })
      .catch(() => {});

    const text = htmlToText(html);

    const unitMatch = text.match(UNIT_RE);
    if (unitMatch && !findings.unit_count) {
      findings.unit_count = Number(unitMatch[1]);
    }
    if (PT_MENTION_RE.test(text)) findings.pt_mention = true;
    for (const m of text.matchAll(new RegExp(NAMED_PROVIDER_RE, "gi"))) {
      if (!findings.named_providers.includes(m[0])) findings.named_providers.push(m[0]);
    }

    await sleep(1000); // 1 req/sec/host
  }

  // Record a unit-count signal (medium confidence — site copy, not an official source).
  if (findings.unit_count) {
    await supabase.from("fe33_size_estimation_signals").insert({
      facility_id,
      signal_type: "site_unit_count",
      numeric_value: findings.unit_count,
      source_url: base,
      confidence: "medium",
      notes: `Facility site mentions ${findings.unit_count} units/apartments`,
    });
  }

  // If the site names a provider we already linked via NPI, upgrade to high.
  let upgraded = 0;
  for (const name of findings.named_providers) {
    const { data: providers } = await supabase
      .from("fe33_therapy_providers")
      .select("id")
      .ilike("organization_name", `%${name}%`);
    for (const p of providers ?? []) {
      const { error } = await supabase
        .from("fe33_facility_therapy_matches")
        .update({
          match_confidence: "high",
          match_evidence: "facility_site_mention",
          evidence_url: base,
          last_observed_at: new Date().toISOString(),
        })
        .eq("facility_id", facility_id)
        .eq("provider_id", p.id);
      if (!error) upgraded++;
    }
  }

  await supabase.from("fe33_facility_sources").insert({
    facility_id,
    source_type: "facility_site",
    source_url: base,
    extracted_value: findings,
    confidence: findings.named_providers.length ? "high" : "low",
    notes: "site_scrape_summary",
  });

  return json({ status: "ok", findings, matches_upgraded: upgraded });
});
