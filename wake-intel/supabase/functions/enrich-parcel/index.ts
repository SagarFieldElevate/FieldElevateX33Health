// enrich-parcel — pull building/property data for a facility from the Wake County
// ArcGIS parcel service and persist it as evidence + a size signal.
//
// POST /functions/v1/enrich-parcel   body: { facility_id: uuid }
import { adminClient } from "../_shared/supabase.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { normalizeAddress, sqlEscape } from "../_shared/address.ts";

const PARCEL_QUERY_URL =
  "https://maps.wake.gov/arcgis/rest/services/Property/Parcels/MapServer/0/query";

// Street-type suffix tokens (normalized form) — stripped when isolating the
// street NAME for the broader fallback query.
const STREET_SUFFIXES = new Set([
  "st", "ave", "blvd", "dr", "rd", "ln", "ct", "cir", "pl", "pkwy", "hwy",
  "ter", "trl", "way", "run", "loop", "pt", "sq", "xing", "pass", "row",
]);
// Leading directional tokens (normalized) that ArcGIS stores separately in
// STPRE, so the FULL_STREET_NAME often omits them — drop them from the name.
const DIRECTIONALS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);

// Run an ArcGIS WHERE and return the feature attributes array (empty on error).
async function queryParcels(where: string): Promise<{ url: string; features: Record<string, unknown>[] }> {
  const url =
    `${PARCEL_QUERY_URL}?where=${encodeURIComponent(where)}` +
    `&outFields=*&returnGeometry=false&f=json`;
  const res = await fetch(url);
  const body = await res.json();
  const features = (body?.features ?? []).map((f: Record<string, unknown>) => f.attributes);
  return { url, features };
}

// Field names VERIFIED against the live Wake County parcel layer (layer 0 "Property"):
//   curl "<PARCEL_QUERY_URL>?where=1=1&outFields=*&resultRecordCount=1&f=json"
// Note the real names differ from the original build-spec guesses:
//   HEATED_AREA -> HEATEDAREA, TOTAL_VALUE -> TOTAL_VALUE_ASSD, ACREAGE -> CALC_AREA.
// REID (real-estate ID) is the key for the public property-record page, NOT PIN_NUM.
const FIELD = {
  siteAddress: "SITE_ADDRESS",
  heatedArea: "HEATEDAREA",
  totalValue: "TOTAL_VALUE_ASSD",
  yearBuilt: "YEAR_BUILT",
  landClass: "LAND_CLASS",
  acreage: "CALC_AREA",
  pin: "PIN_NUM",
  reid: "REID",
  zip: "ZIPNUM",
} as const;

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
    .select("id, address, zip")
    .eq("id", facility_id)
    .single();

  if (fErr || !facility) return json({ error: "facility_not_found" }, 404);
  if (!facility.address) return json({ error: "no_address" }, 400);

  // Build a WHERE on house-number + first street token (more selective than the
  // house number alone, which would match the whole block).
  const norm = normalizeAddress(facility.address);
  const tokens = norm.split(" ").filter(Boolean);
  // Escape only the values that go INSIDE the quoted LIKE pattern — do NOT escape the
  // whole clause, or the delimiter quotes get doubled into invalid SQL.
  const houseNo = sqlEscape((tokens[0] ?? "").toUpperCase());
  const streetTok = sqlEscape((tokens[1] ?? "").toUpperCase());
  const primaryWhere = `UPPER(${FIELD.siteAddress}) LIKE '${houseNo}%${streetTok}%'`;

  // The street NAME alone (drop the house number, leading directional, and the
  // trailing suffix) used by the fallback. e.g. "10810 sandy oak ln" -> "SANDY OAK".
  let nameToks = tokens.slice(1);
  while (nameToks.length > 1 && DIRECTIONALS.has(nameToks[0])) nameToks = nameToks.slice(1);
  while (nameToks.length > 1 && STREET_SUFFIXES.has(nameToks[nameToks.length - 1])) {
    nameToks = nameToks.slice(0, -1);
  }
  const streetName = sqlEscape(nameToks.join(" ").toUpperCase());

  let url = "";
  let feature: Record<string, unknown> | undefined;
  let matchMode = "house_street";
  try {
    // 1) Primary: exact house number + street.
    const primary = await queryParcels(primaryWhere);
    url = primary.url;
    feature = primary.features[0];

    // 2) Fallback: street-name LIKE. Recovers facilities whose stored house number
    //    is slightly off from the parcel (e.g. "10810 Sandy Oak Ln" vs parcel
    //    "10820 Sandy Oak Ln"). Only accept when it resolves UNAMBIGUOUSLY: a single
    //    parcel, or — if the street has many lots — a single parcel once narrowed by
    //    the facility's zip. This protects the 24 already-matching facilities and
    //    avoids picking a random lot on a multi-home street.
    if (!feature && streetName) {
      const fbWhere = `UPPER(${FIELD.siteAddress}) LIKE '%${streetName}%'`;
      const fb = await queryParcels(fbWhere);
      if (fb.features.length === 1) {
        url = fb.url;
        feature = fb.features[0];
        matchMode = "street_name_fallback";
      } else if (fb.features.length > 1 && facility.zip) {
        const zip = sqlEscape(String(facility.zip).slice(0, 5));
        const zipWhere = `UPPER(${FIELD.siteAddress}) LIKE '%${streetName}%' AND ${FIELD.zip} LIKE '${zip}%'`;
        const zfb = await queryParcels(zipWhere);
        if (zfb.features.length === 1) {
          url = zfb.url;
          feature = zfb.features[0];
          matchMode = "street_name_zip_fallback";
        } else {
          url = fb.url; // record the attempted fallback for audit
        }
      } else {
        url = fb.url;
      }
    }
  } catch (e) {
    await supabase.from("fe33_facility_sources").insert({
      facility_id,
      source_type: "wake_parcel",
      source_url: url || PARCEL_QUERY_URL,
      notes: `fetch_failed: ${String(e)}`,
    });
    return json({ status: "fetch_failed", detail: String(e) }, 502);
  }

  // Always persist the API hit for replay/audit (architecture decision §1).
  await supabase.from("fe33_facility_sources").insert({
    facility_id,
    source_type: "wake_parcel",
    source_url: url,
    raw_response: feature ? { features: [{ attributes: feature }] } : null,
    extracted_value: feature ?? null,
    confidence: feature ? "medium" : null,
    notes: feature ? `matched via ${matchMode}` : "no_match",
  });

  if (!feature) return json({ status: "no_match" });

  const sqft = Number(feature[FIELD.heatedArea]) || null;

  await supabase
    .from("fe33_facilities")
    .update({
      building_sqft: sqft,
      assessed_value: Number(feature[FIELD.totalValue]) || null,
      year_built: Number(feature[FIELD.yearBuilt]) || null,
      property_use_code: feature[FIELD.landClass] ?? null,
      acreage: Number(feature[FIELD.acreage]) || null,
      parcel_pin: feature[FIELD.pin] ?? null,
      // The Wake real-estate record page keys on REID, not PIN — a PIN-based URL
      // 302-redirects to NoAccount.asp. Fall back to PIN only if REID is absent.
      property_record_url: feature[FIELD.reid]
        ? `https://services.wake.gov/realestate/Account.asp?id=${feature[FIELD.reid]}`
        : null,
    })
    .eq("id", facility_id);

  if (sqft) {
    await supabase.from("fe33_size_estimation_signals").insert({
      facility_id,
      signal_type: "sqft_estimate",
      numeric_value: sqft,
      source_url: url,
      confidence: sqft > 90000 ? "high" : sqft > 60000 ? "medium" : "low",
      notes: `Wake parcel heated area = ${sqft} sqft`,
    });
  }

  return json({ status: "ok", sqft, match_mode: matchMode });
});
