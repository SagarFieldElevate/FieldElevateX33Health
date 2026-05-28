import { createClient } from "@/lib/supabase/server";
import { csvResponse, rowsToCsv } from "@/lib/csv";
import type {
  Facility,
  FacilityPTSummary,
  FacilityTherapyMatch,
} from "@/lib/types";

export const dynamic = "force-dynamic";

// PT intel CSV — column order per spec §6.5.
const HEADERS = [
  "facility_name",
  "address",
  "city",
  "size_class",
  "unit_count",
  "pt_market_status",
  "confirmed_pt_providers",
  "pt_provider_count",
  "last_observed_at",
  "evidence_urls",
];

export async function GET() {
  const supabase = await createClient();

  // No-auth internal tool: reads run via the service-role client (see lib/supabase/server.ts).
  const [{ data: summary }, { data: facilities }, { data: matches }] =
    await Promise.all([
      supabase.from("fe33_v_facility_pt_summary").select("*").order("name"),
      supabase
        .from("fe33_facilities")
        .select("id,address,city")
        .order("name"),
      supabase
        .from("fe33_facility_therapy_matches")
        .select("facility_id,is_current,last_observed_at,evidence_url"),
    ]);

  const sum = (summary as FacilityPTSummary[]) ?? [];
  const facMeta = new Map(
    ((facilities as Pick<Facility, "id" | "address" | "city">[]) ?? []).map(
      (f) => [f.id, f],
    ),
  );

  type M = Pick<
    FacilityTherapyMatch,
    "facility_id" | "is_current" | "last_observed_at" | "evidence_url"
  >;
  const matchesByFacility = new Map<string, M[]>();
  for (const m of (matches as M[]) ?? []) {
    const arr = matchesByFacility.get(m.facility_id) ?? [];
    arr.push(m);
    matchesByFacility.set(m.facility_id, arr);
  }

  const rows = sum.map((s) => {
    const meta = facMeta.get(s.facility_id);
    const fMatches = (matchesByFacility.get(s.facility_id) ?? []).filter(
      (m) => m.is_current,
    );
    const lastObserved = fMatches
      .map((m) => m.last_observed_at)
      .filter(Boolean)
      .sort()
      .reverse()[0];
    const evidence = fMatches
      .map((m) => m.evidence_url)
      .filter((u): u is string => !!u);

    return [
      s.name,
      meta?.address,
      s.city ?? meta?.city,
      s.size_class,
      s.unit_count,
      s.pt_market_status,
      (s.confirmed_pt_providers ?? []).filter(Boolean),
      s.confirmed_pt_provider_count,
      lastObserved,
      evidence,
    ];
  });

  const csv = rowsToCsv(HEADERS, rows);
  return csvResponse("wake-pt-intel.csv", csv);
}
