// enrich-therapy-provider — find PT/OT/rehab providers registered at a facility's
// address via the NPPES NPI Registry, upsert them, and link them to the facility.
// This powers Product B (PT market intel) and Product A's qualification context.
//
// POST /functions/v1/enrich-therapy-provider   body: { facility_id: uuid }
import { adminClient } from "../_shared/supabase.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { addressesMatch } from "../_shared/address.ts";

const NPPES_BASE = "https://npiregistry.cms.hhs.gov/api/?version=2.1";

// Taxonomy descriptions to query (NPPES filters on description text, not code).
const TAXONOMIES = [
  "Physical Therapist",
  "Occupational Therapist",
  "Speech-Language Pathologist",
  "Rehabilitation",
  "Clinic/Center, Rehabilitation",
];

// Substring → canonical parent organization.
const KNOWN_PARENTS: Array<[RegExp, string]> = [
  [/wakemed/i, "WakeMed Health & Hospitals"],
  [/unc(\s|-)?health|rex healthcare/i, "UNC Health"],
  [/duke/i, "Duke Health"],
  [/genesis/i, "Genesis Rehab Services"],
  [/aegis/i, "Aegis Therapies"],
  [/reliant/i, "Reliant Rehabilitation"],
  [/encompass/i, "Encompass Health"],
  [/powerback|genesis/i, "Powerback Rehabilitation"],
  [/fox rehab/i, "Fox Rehabilitation"],
];

function detectParent(orgName: string): string | null {
  for (const [re, parent] of KNOWN_PARENTS) if (re.test(orgName)) return parent;
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    .select("id, address, city, state, zip, size_class")
    .eq("id", facility_id)
    .single();

  if (fErr || !facility) return json({ error: "facility_not_found" }, 404);

  // Skip facilities we already know are too small to be worth PT-provider intel.
  if (["confirmed_under_100", "likely_under_100"].includes(facility.size_class)) {
    return json({ status: "skipped_too_small" });
  }
  if (!facility.city && !facility.zip) {
    return json({ status: "skipped_no_geo", reason: "facility has no city or zip" });
  }

  let matched = 0;
  let queried = 0;

  for (const taxonomy of TAXONOMIES) {
    const params = new URLSearchParams({
      taxonomy_description: taxonomy,
      state: facility.state || "NC",
      address_purpose: "LOCATION",
      limit: "50",
    });
    if (facility.zip) params.set("postal_code", facility.zip);
    else if (facility.city) params.set("city", facility.city);

    const url = `${NPPES_BASE}&${params.toString()}`;
    queried++;

    let body;
    try {
      const res = await fetch(url);
      body = await res.json();
    } catch (e) {
      await supabase.from("fe33_facility_sources").insert({
        facility_id,
        source_type: "nppes",
        source_url: url,
        notes: `fetch_failed: ${String(e)}`,
      });
      await sleep(1100);
      continue;
    }

    const results: any[] = body?.results ?? [];

    // Find provider records whose LOCATION address matches this facility.
    const facilityMatches = results.filter((r) =>
      (r.addresses ?? []).some(
        (a: any) =>
          a.address_purpose === "LOCATION" &&
          addressesMatch(a.address_1, facility.address),
      ),
    );

    await supabase.from("fe33_facility_sources").insert({
      facility_id,
      source_type: "nppes",
      source_url: url,
      raw_response: body,
      extracted_value: { taxonomy, result_count: results.length, matched: facilityMatches.length },
      confidence: facilityMatches.length ? "medium" : null,
      notes: facilityMatches.length ? null : "nppes_no_match",
    });

    for (const r of facilityMatches) {
      const npi = String(r.number);
      // NPI-2 = organization (organization_name); NPI-1 = individual practitioner
      // (build from first/last + credential). Removes the "Unknown provider" fallback.
      const isOrg = r.enumeration_type === "NPI-2";
      const indivName = [r.basic?.first_name, r.basic?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      const cred = r.basic?.credential ? `, ${r.basic.credential}` : "";
      const orgName: string = isOrg
        ? r.basic?.organization_name?.trim() || "Unknown organization"
        : indivName
          ? `${indivName}${cred}`
          : "Unknown provider";
      const loc =
        (r.addresses ?? []).find((a: any) => a.address_purpose === "LOCATION") ?? {};
      const primaryTax =
        (r.taxonomies ?? []).find((t: any) => t.primary) ?? r.taxonomies?.[0] ?? {};

      const { data: provider, error: pErr } = await supabase
        .from("fe33_therapy_providers")
        .upsert(
          {
            npi,
            organization_name: orgName,
            entity_type: isOrg ? "organization" : "individual",
            parent_organization: detectParent(orgName),
            taxonomy_code: primaryTax.code ?? null,
            taxonomy_description: primaryTax.desc ?? taxonomy,
            primary_address: loc.address_1 ?? null,
            city: loc.city ?? null,
            state: loc.state ?? null,
            zip: loc.postal_code ?? null,
            phone: loc.telephone_number ?? null,
            is_active: true,
            raw_nppes_response: r,
            last_verified_at: new Date().toISOString(),
          },
          { onConflict: "npi" },
        )
        .select("id")
        .single();

      if (pErr || !provider) continue;

      // medium = same-address NPI + PT taxonomy. Upgraded to high by
      // enrich-facility-site when the facility's own site names the provider.
      await supabase.from("fe33_facility_therapy_matches").upsert(
        {
          facility_id,
          provider_id: provider.id,
          match_confidence: "medium",
          match_evidence: "same_address_npi",
          named_provider: orgName,
          is_current: true,
          last_observed_at: new Date().toISOString(),
        },
        { onConflict: "facility_id,provider_id" },
      );
      matched++;
    }

    await sleep(1100); // be polite to NPPES (~1 req/sec)
  }

  return json({ status: "ok", taxonomies_queried: queried, providers_matched: matched });
});
