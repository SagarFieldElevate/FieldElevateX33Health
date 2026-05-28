// import-dhsr — monthly load of NC DHSR Adult Care Home + Nursing Home listings.
// Filters to Wake County, fuzzy-matches existing facilities to set licensed_beds and
// facility_type, and routes unmatched 75+ bed homes to the review queue.
//
// POST /functions/v1/import-dhsr   body: {} (no args)
//
// ⚠ DHSR does NOT license pure independent living in NC — this only covers AL / SNF.
//
// SOURCES (VERIFIED 05/2026):
//   Adult Care Homes are published by the Adult Care Licensure Section (ACLS), NOT the
//   Acute & Home Care section. The originally-assumed page
//   (https://info.ncdhhs.gov/dhsr/ahc/listings.html) hosts hospital / home-care /
//   hospice / ambulatory-surgical lists and contains NO adult-care or nursing-home file.
//   Real files (xlsx) live under /dhsr/data/:
//     - Adult Care Homes:  Ahlist.xlsx   (linked from /dhsr/acls/faclistings.html)
//     - Nursing Homes:     nhlist_co.xlsx / nhlist_a.xlsx (NHLCS data dir)
//   These workbooks have a multi-row title banner before the header row, and the
//   facility name is in "DBA Name" (not "Facility Name"); bed counts are "Bed Count"
//   (ACH) and "Nursing Facility Beds Total" (NH). discoverWorkbookUrls() scrapes the
//   ACLS page for the live Ahlist link and probes the known NH data files, so version
//   bumps in the ?ver= query string are picked up automatically.
import { read, utils } from "https://esm.sh/xlsx@0.18.5";
import { adminClient } from "../_shared/supabase.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

// ACLS facility-listings page is where the Adult Care Home workbook link lives.
const ACLS_LISTINGS_PAGE = "https://info.ncdhhs.gov/dhsr/acls/faclistings.html";
const DATA_BASE = "https://info.ncdhhs.gov/dhsr/data/";
// Nursing-home workbooks have no HTML landing page that reliably links the xlsx, so
// reference them directly. nhlist_co = by county (preferred), nhlist_a = alphabetical.
const NURSING_HOME_FILES = ["nhlist_co.xlsx", "nhlist_a.xlsx"];

// Candidate column names (case-insensitive, whitespace-trimmed). First present wins.
// "DBA Name" is the public/doing-business-as facility name; "Name of Licensee Legal
// Name" is the operating entity (kept as a fallback only).
const COLS = {
  name: ["DBA Name", "Facility Name", "Name", "FacilityName", "Name of Licensee Legal Name"],
  county: ["County", "COUNTY"],
  beds: [
    "Bed Count",
    "Nursing Facility Beds Total",
    "Licensed Beds",
    "Beds",
    "Capacity",
    "Approved Beds",
  ],
  // Physical-location columns. Both the Adult Care Home (Ahlist.xlsx) and Nursing
  // Home (nhlist_co.xlsx) workbooks carry a "Site …" block (the actual facility
  // address) and a "Facility …" block (mailing, may include a suite in Address 2).
  // Prefer "Site"; fall back to "Facility".
  address: ["Site Address", "Facility Address", "Address"],
  city: ["Site City", "Facility City", "City"],
  zip: ["Site Zip", "Facility Zip", "Zip", "Zip Code"],
};

function pick(row: Record<string, unknown>, candidates: string[]): unknown {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const k = keys.find((kk) => kk.trim().toLowerCase() === c.toLowerCase());
    if (k !== undefined) return row[k];
  }
  return undefined;
}

// Coerce a cell to a trimmed string or null. Zip codes can arrive as numbers
// (xlsx infers numeric types), so stringify before trimming.
function pickStr(row: Record<string, unknown>, candidates: string[]): string | null {
  const v = pick(row, candidates);
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|of|at|and|inc|llc|rehabilitation|rehab|center|community|senior|living|nursing|care|home|health)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" "));
  const tb = nb.split(" ");
  const overlap = tb.filter((t) => ta.has(t)).length;
  return overlap >= 2 && overlap / Math.max(ta.size, tb.length) >= 0.6;
}

// Returns workbook URLs tagged with the kind of facility they describe so the caller
// can infer facility_type without guessing from the filename.
type WorkbookRef = { url: string; kind: "adult_care" | "nursing" };

async function discoverWorkbookUrls(): Promise<WorkbookRef[]> {
  const refs: WorkbookRef[] = [];

  // 1) Scrape the ACLS listings page for the Adult Care Home workbook link. The link
  //    text is "Adult Care Home Listing"; the href is e.g. ../data/Ahlist.xlsx?ver=2.9.
  try {
    const res = await fetch(ACLS_LISTINGS_PAGE, {
      headers: { "User-Agent": "Mozilla/5.0 (wake-intel import-dhsr)" },
    });
    const html = await res.text();
    for (const m of html.matchAll(/href="([^"]*[Aa]hlist\.xlsx[^"]*)"/g)) {
      refs.push({ url: new URL(m[1], ACLS_LISTINGS_PAGE).toString(), kind: "adult_care" });
    }
    // Fall back to any *.xlsx on the page that looks like an adult-care list.
    if (!refs.some((r) => r.kind === "adult_care")) {
      for (const m of html.matchAll(/href="([^"]+\.xlsx?[^"]*)"/gi)) {
        if (/ah?list|adult/i.test(m[1])) {
          refs.push({ url: new URL(m[1], ACLS_LISTINGS_PAGE).toString(), kind: "adult_care" });
        }
      }
    }
  } catch {
    // ACLS page unreachable — fall through to the hard-coded data file below.
  }
  // Hard fallback for the ACH file if scraping yielded nothing.
  if (!refs.some((r) => r.kind === "adult_care")) {
    refs.push({ url: `${DATA_BASE}Ahlist.xlsx`, kind: "adult_care" });
  }

  // 2) Nursing-home workbooks are referenced directly from the data dir. Probe each
  //    and keep the first that responds with a real spreadsheet.
  for (const file of NURSING_HOME_FILES) {
    const url = `${DATA_BASE}${file}`;
    try {
      const head = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0 (wake-intel import-dhsr)" },
      });
      const ct = head.headers.get("content-type") ?? "";
      if (head.ok && /spreadsheet|officedocument|octet-stream/i.test(ct)) {
        refs.push({ url, kind: "nursing" });
        break; // one nursing-home list (county-ordered) is enough
      }
    } catch {
      // try the next candidate
    }
  }

  return refs;
}

// DHSR workbooks have a multi-row title banner before the real header row. Find the
// row that contains the column headers (it always has "License #") and re-key the
// sheet from there so utils.sheet_to_json produces clean column names.
function rowsFromWorkbook(buf: Uint8Array): Record<string, unknown>[] {
  const wb = read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix: unknown[][] = utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  let headerIdx = matrix.findIndex((r) =>
    Array.isArray(r) &&
    r.some((c) => typeof c === "string" && /license\s*#/i.test(c)) &&
    r.some((c) => typeof c === "string" && /county/i.test(c))
  );
  if (headerIdx < 0) headerIdx = 0; // fall back to first row
  const headers = (matrix[headerIdx] as unknown[]).map((h) => String(h ?? "").trim());
  const out: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!Array.isArray(r) || r.every((c) => c === undefined || c === "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      if (h) obj[h] = r[j];
    });
    out.push(obj);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = adminClient();
  const workbooks = await discoverWorkbookUrls();
  if (workbooks.length === 0) {
    return json({ status: "no_workbooks_found", page: ACLS_LISTINGS_PAGE }, 502);
  }

  const { data: facilities } = await supabase
    .from("fe33_facilities")
    .select("id, name, facility_type, licensed_beds, address, city, zip");

  let updated = 0;
  let queued = 0;
  let skipped = 0;
  let wakeRows = 0;

  for (const { url, kind } of workbooks) {
    let rows: Record<string, unknown>[] = [];
    try {
      const buf = new Uint8Array(
        await (
          await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (wake-intel import-dhsr)" },
          })
        ).arrayBuffer(),
      );
      rows = rowsFromWorkbook(buf);
    } catch (e) {
      await supabase.from("fe33_facility_sources").insert({
        facility_id: null,
        source_type: "dhsr",
        source_url: url,
        notes: `parse_failed: ${String(e)}`,
      });
      continue;
    }

    const isNursing = kind === "nursing";

    for (const row of rows) {
      const county = String(pick(row, COLS.county) ?? "");
      if (!/wake/i.test(county)) continue;
      wakeRows++;

      const dhsrName = String(pick(row, COLS.name) ?? "").trim();
      const beds = Number(pick(row, COLS.beds)) || null;
      if (!dhsrName) continue;

      // Physical address from the DHSR "Site …" columns (fall back to "Facility …").
      const dhsrAddress = pickStr(row, COLS.address);
      const dhsrCity = pickStr(row, COLS.city);
      const dhsrZip = pickStr(row, COLS.zip);

      const hit = (facilities ?? []).find((f) => nameMatch(f.name, dhsrName));

      if (hit) {
        // Adult Care Home listings imply AL; Nursing/SNF has no facility_type enum
        // value, so leave type unchanged when it's a nursing workbook.
        const inferredType = hit.facility_type ?? (isNursing ? null : "AL");
        // Only backfill address fields that are currently empty — never clobber a
        // verified/parcel-confirmed address with the DHSR mailing value.
        const patch: Record<string, unknown> = {
          licensed_beds: beds ?? hit.licensed_beds,
          facility_type: inferredType,
        };
        if (!hit.address && dhsrAddress) patch.address = dhsrAddress;
        if (!hit.city && dhsrCity) patch.city = dhsrCity;
        if (!hit.zip && dhsrZip) patch.zip = dhsrZip;
        await supabase.from("fe33_facilities").update(patch).eq("id", hit.id);
        updated++;
      } else if (beds !== null && beds >= 75) {
        // Unknown 75+ bed home — could be a facility we should track.
        // Dedup: re-running this import must not re-create the same review item.
        // facility_id is null for these, so key on (reason, details->>dhsr_name)
        // among still-open rows.
        const { data: existing } = await supabase
          .from("fe33_review_queue")
          .select("id")
          .eq("reason", "new_facility_unverified")
          .eq("status", "open")
          .eq("details->>dhsr_name", dhsrName)
          .limit(1);
        if (existing && existing.length > 0) {
          skipped++;
        } else {
          const { error } = await supabase.from("fe33_review_queue").insert({
            facility_id: null,
            reason: "new_facility_unverified",
            details: {
              dhsr_name: dhsrName,
              beds,
              source_url: url,
              county,
              address: dhsrAddress,
              city: dhsrCity,
              zip: dhsrZip,
            },
          });
          if (!error) queued++;
        }
      }
    }
  }

  return json({
    status: "ok",
    workbooks: workbooks.length,
    wake_rows: wakeRows,
    facilities_updated: updated,
    review_items_queued: queued,
    review_items_skipped_dup: skipped,
  });
});
