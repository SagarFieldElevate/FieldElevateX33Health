import { createClient } from "@/lib/supabase/server";
import { csvResponse, rowsToCsv } from "@/lib/csv";
import { formatCents } from "@/lib/domain";
import type { CallNote, Contact, Facility, FacilitySource } from "@/lib/types";

export const dynamic = "force-dynamic";

// Sales pipeline CSV — column order per spec §6.5.
const HEADERS = [
  "facility_name",
  "address",
  "city",
  "operator",
  "facility_type",
  "size_class",
  "unit_count",
  "licensed_beds",
  "building_sqft",
  "ai_priority",
  "ai_outreach_status",
  "ai_last_contact_at",
  "ai_estimated_deal_size",
  "ai_current_software",
  "ai_pain_points",
  "primary_contact_name",
  "primary_contact_title",
  "primary_contact_phone",
  "primary_contact_email",
  "notes_count",
  "last_call_summary",
  "next_follow_up",
  "evidence_urls",
];

export async function GET() {
  const supabase = await createClient();

  // No-auth internal tool: reads run via the service-role client (see lib/supabase/server.ts).
  const [{ data: facilities }, { data: contacts }, { data: notes }, { data: sources }] =
    await Promise.all([
      supabase.from("fe33_facilities").select("*").order("name"),
      supabase.from("fe33_contacts").select("*").eq("is_active", true),
      supabase
        .from("fe33_call_notes")
        .select("*")
        .order("interaction_date", { ascending: false }),
      supabase.from("fe33_facility_sources").select("facility_id,source_url"),
    ]);

  const facs = (facilities as Facility[]) ?? [];
  const cts = (contacts as Contact[]) ?? [];
  const nts = (notes as CallNote[]) ?? [];
  const srcs = (sources as Pick<FacilitySource, "facility_id" | "source_url">[]) ?? [];

  const primaryByFacility = new Map<string, Contact>();
  for (const c of cts) {
    const existing = primaryByFacility.get(c.facility_id);
    if (!existing || (c.is_primary && !existing.is_primary)) {
      primaryByFacility.set(c.facility_id, c);
    }
  }

  const notesByFacility = new Map<string, CallNote[]>();
  for (const n of nts) {
    (notesByFacility.get(n.facility_id) ?? notesByFacility.set(n.facility_id, []).get(n.facility_id))!.push(n);
  }

  const evidenceByFacility = new Map<string, string[]>();
  for (const s of srcs) {
    if (!s.source_url) continue;
    const arr = evidenceByFacility.get(s.facility_id) ?? [];
    arr.push(s.source_url);
    evidenceByFacility.set(s.facility_id, arr);
  }

  const rows = facs.map((f) => {
    const primary = primaryByFacility.get(f.id);
    const facNotes = notesByFacility.get(f.id) ?? [];
    const lastNote = facNotes[0];
    const nextFollowUp = facNotes
      .filter((n) => !n.follow_up_done && n.follow_up_at)
      .sort((a, b) => (a.follow_up_at! < b.follow_up_at! ? -1 : 1))[0];

    return [
      f.name,
      f.address,
      f.city,
      f.operator,
      f.facility_type,
      f.size_class,
      f.unit_count,
      f.licensed_beds,
      f.building_sqft,
      f.ai_priority,
      f.ai_outreach_status,
      f.ai_last_contact_at,
      f.ai_estimated_deal_size_cents != null
        ? formatCents(f.ai_estimated_deal_size_cents)
        : "",
      f.ai_current_software,
      f.ai_pain_points,
      primary?.name,
      primary?.title,
      primary?.phone_direct ?? primary?.phone,
      primary?.email,
      facNotes.length,
      lastNote?.summary,
      nextFollowUp?.follow_up_at,
      evidenceByFacility.get(f.id) ?? [],
    ];
  });

  const csv = rowsToCsv(HEADERS, rows);
  return csvResponse("wake-sales-pipeline.csv", csv);
}
