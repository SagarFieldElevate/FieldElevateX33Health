import { createClient } from "@/lib/supabase/server";
import type {
  CallNote,
  Contact,
  Facility,
  FacilityPTSummary,
  FacilitySource,
  FacilityTherapyMatch,
  MonthlyRun,
  PTProviderFootprint,
  ReviewQueueItem,
  TherapyProvider,
} from "@/lib/types";

export async function getFacilities(): Promise<Facility[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_facilities")
    .select("*")
    .order("name");
  return (data as Facility[]) ?? [];
}

export async function getFacility(id: string): Promise<Facility | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_facilities")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Facility) ?? null;
}

export async function getContactsForFacilities(
  facilityIds: string[],
): Promise<Contact[]> {
  if (facilityIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_contacts")
    .select("*")
    .in("facility_id", facilityIds)
    .eq("is_active", true);
  return (data as Contact[]) ?? [];
}

export async function getContacts(facilityId: string): Promise<Contact[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_contacts")
    .select("*")
    .eq("facility_id", facilityId)
    .order("is_primary", { ascending: false })
    .order("name");
  return (data as Contact[]) ?? [];
}

export async function getCallNotes(facilityId: string): Promise<CallNote[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_call_notes")
    .select("*")
    .eq("facility_id", facilityId)
    .order("interaction_date", { ascending: false });
  return (data as CallNote[]) ?? [];
}

// Last call summary per facility — used for the dashboard "last contact" column.
export async function getLatestNotesByFacility(): Promise<
  Map<string, CallNote>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_call_notes")
    .select("*")
    .order("interaction_date", { ascending: false });
  const map = new Map<string, CallNote>();
  for (const n of (data as CallNote[]) ?? []) {
    if (!map.has(n.facility_id)) map.set(n.facility_id, n);
  }
  return map;
}

// Count of current PT matches per facility (for the de-emphasized PT badge).
export async function getMatchesForFacilitiesCount(
  facilityIds: string[],
): Promise<Record<string, number>> {
  if (facilityIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_facility_therapy_matches")
    .select("facility_id")
    .in("facility_id", facilityIds)
    .eq("is_current", true);
  const counts: Record<string, number> = {};
  for (const row of (data as { facility_id: string }[]) ?? []) {
    counts[row.facility_id] = (counts[row.facility_id] ?? 0) + 1;
  }
  return counts;
}

export async function getFacilitySources(
  facilityId: string,
): Promise<FacilitySource[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_facility_sources")
    .select("*")
    .eq("facility_id", facilityId)
    .order("fetched_at", { ascending: false });
  return (data as FacilitySource[]) ?? [];
}

export interface OpenFollowUp extends CallNote {
  facility?: Pick<Facility, "id" | "name" | "ai_priority"> | null;
  contact?: Pick<Contact, "id" | "name"> | null;
}

export async function getOpenFollowUps(): Promise<OpenFollowUp[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_call_notes")
    .select(
      "*, facility:fe33_facilities(id,name,ai_priority), contact:fe33_contacts(id,name)",
    )
    .eq("follow_up_done", false)
    .not("follow_up_at", "is", null)
    .order("follow_up_at", { ascending: true });
  return (data as OpenFollowUp[]) ?? [];
}

export interface ReviewItemWithFacility extends ReviewQueueItem {
  facility?: Pick<
    Facility,
    "id" | "name" | "size_class" | "ai_outreach_status" | "city"
  > | null;
}

export async function getOpenReviewItems(): Promise<ReviewItemWithFacility[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_review_queue")
    .select(
      "*, facility:fe33_facilities(id,name,size_class,ai_outreach_status,city)",
    )
    .eq("status", "open")
    .order("created_at", { ascending: true });
  return (data as ReviewItemWithFacility[]) ?? [];
}

export async function getMonthlyRuns(): Promise<MonthlyRun[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_monthly_runs")
    .select("*")
    .order("started_at", { ascending: false });
  return (data as MonthlyRun[]) ?? [];
}

export async function getMonthlyRun(id: string): Promise<MonthlyRun | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_monthly_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as MonthlyRun) ?? null;
}

export async function getLastSyncAt(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_monthly_runs")
    .select("finished_at,started_at,status")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return (data.finished_at as string) ?? (data.started_at as string) ?? null;
}

// ---- Product B (PT intel) ----

export async function getFacilityPTSummary(): Promise<FacilityPTSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_v_facility_pt_summary")
    .select("*")
    .order("name");
  return (data as FacilityPTSummary[]) ?? [];
}

export async function getPTProviderFootprint(): Promise<
  PTProviderFootprint[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_v_pt_provider_footprint")
    .select("*")
    .order("active_facility_count", { ascending: false });
  return (data as PTProviderFootprint[]) ?? [];
}

export async function getTherapyProvider(
  id: string,
): Promise<TherapyProvider | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_therapy_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as TherapyProvider) ?? null;
}

export interface MatchWithFacility extends FacilityTherapyMatch {
  facility?: Pick<
    Facility,
    "id" | "name" | "size_class" | "unit_count" | "city"
  > | null;
}

export async function getMatchesForProvider(
  providerId: string,
): Promise<MatchWithFacility[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_facility_therapy_matches")
    .select(
      "*, facility:fe33_facilities(id,name,size_class,unit_count,city)",
    )
    .eq("provider_id", providerId)
    .order("last_observed_at", { ascending: false });
  return (data as MatchWithFacility[]) ?? [];
}

export interface MatchWithProvider extends FacilityTherapyMatch {
  provider?: Pick<
    TherapyProvider,
    "id" | "organization_name" | "parent_organization" | "npi"
  > | null;
}

export async function getMatchesForFacility(
  facilityId: string,
): Promise<MatchWithProvider[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_facility_therapy_matches")
    .select(
      "*, provider:fe33_therapy_providers(id,organization_name,parent_organization,npi)",
    )
    .eq("facility_id", facilityId)
    .order("last_observed_at", { ascending: false });
  return (data as MatchWithProvider[]) ?? [];
}

export async function getFacilityPTSummaryOne(
  facilityId: string,
): Promise<FacilityPTSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fe33_v_facility_pt_summary")
    .select("*")
    .eq("facility_id", facilityId)
    .maybeSingle();
  return (data as FacilityPTSummary) ?? null;
}
