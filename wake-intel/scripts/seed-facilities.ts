/**
 * Seed Wake County senior-living facilities into Supabase.
 *
 * Loads scripts/seed-data/facilities.json (human-confirmed) and, if present,
 * scripts/seed-data/researched-candidates.json (real, cited public facilities —
 * provisional until reconciled against the Codex roster).
 *
 * Idempotent: matches existing rows by name (case-insensitive) and updates them,
 * otherwise inserts. Only whitelisted columns are written (so extra fields like
 * `source_url` in the candidates file don't break the insert — they're folded into
 * internal_notes instead).
 *
 * Usage: npm run seed
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

// Node < 22 has no global WebSocket; supabase-js realtime needs one. Polyfill.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = ws as unknown as typeof WebSocket;
}

config({ path: ".env.local" });

type SeedFacility = {
  name: string;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  zip?: string | null;
  operator?: string | null;
  ownership_type?: string | null;
  facility_type?: string | null;
  unit_count?: number | null;
  unit_count_type?: string | null;
  size_class?: string | null;
  size_confidence?: string | null;
  licensed_beds?: number | null;
  website_url?: string | null;
  internal_notes?: string | null;
  // candidates-only, not a column:
  source_url?: string | null;
};

// Columns that exist on fe33_facilities and are safe to write from a seed file.
const COLUMNS: (keyof SeedFacility)[] = [
  "name", "address", "city", "county", "state", "zip", "operator",
  "ownership_type", "facility_type", "unit_count", "unit_count_type",
  "size_class", "size_confidence", "licensed_beds", "website_url", "internal_notes",
];

// Build a DB row from a seed entry: whitelist columns, fold source_url into notes.
function toRow(f: SeedFacility): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const k of COLUMNS) if (f[k] != null) row[k] = f[k];
  if (f.source_url) {
    row.internal_notes = `provisional roster (verify vs Codex). source: ${f.source_url}`;
  }
  return row;
}

function load(file: string): SeedFacility[] {
  const path = resolve(process.cwd(), "scripts/seed-data", file);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as SeedFacility[];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const confirmed = load("facilities.json");
  const candidates = load("researched-candidates.json");
  const facilities = [...confirmed, ...candidates];
  console.log(`Loaded ${confirmed.length} confirmed + ${candidates.length} researched = ${facilities.length} facilities`);

  let inserted = 0;
  let updated = 0;

  for (const f of facilities) {
    const row = toRow(f);
    const { data: existing, error: selErr } = await supabase
      .from("fe33_facilities")
      .select("id")
      .ilike("name", f.name)
      .limit(1)
      .maybeSingle();
    if (selErr) {
      console.error(`  ✗ lookup failed for "${f.name}":`, selErr.message);
      continue;
    }

    let facilityId: string | undefined;
    if (existing) {
      const { error } = await supabase.from("fe33_facilities").update(row).eq("id", existing.id);
      if (error) { console.error(`  ✗ update failed for "${f.name}":`, error.message); continue; }
      facilityId = existing.id; updated++; console.log(`  ↻ updated "${f.name}"`);
    } else {
      const { data: r, error } = await supabase.from("fe33_facilities").insert(row).select("id").single();
      if (error || !r) { console.error(`  ✗ insert failed for "${f.name}":`, error?.message); continue; }
      facilityId = r.id; inserted++; console.log(`  + inserted "${f.name}"`);
    }

    // Back an exact unit count with a high-confidence signal (idempotent).
    if (facilityId && f.unit_count != null && f.unit_count_type === "exact") {
      const { data: sig } = await supabase
        .from("fe33_size_estimation_signals")
        .select("id")
        .eq("facility_id", facilityId)
        .eq("signal_type", "official_unit_count")
        .limit(1)
        .maybeSingle();
      if (!sig) {
        await supabase.from("fe33_size_estimation_signals").insert({
          facility_id: facilityId,
          signal_type: "official_unit_count",
          numeric_value: f.unit_count,
          confidence: "high",
          notes: "seed: confirmed exact count",
        });
      }
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${updated} updated, ${facilities.length} total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
