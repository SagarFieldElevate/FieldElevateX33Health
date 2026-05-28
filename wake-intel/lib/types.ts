// Domain types for Wake Senior Living Intelligence.
// Mirror of the live fe33_* schema (see docs/WAKE_INTEL_BUILD_SPEC_v2.md §1.3).

export type SizeClass =
  | "confirmed_100_plus"
  | "likely_100_plus"
  | "possible_100_plus"
  | "likely_under_100"
  | "confirmed_under_100"
  | "unknown";

export type SizeConfidence = "high" | "medium" | "low" | "unknown";

export type AIOutreachStatus =
  | "not_contacted"
  | "contacted"
  | "demo_scheduled"
  | "demo_done"
  | "proposal_sent"
  | "negotiating"
  | "won"
  | "lost"
  | "disqualified";

export type AIPriority = "hot" | "warm" | "cold" | "dead";

export type PTMarketStatus =
  | "open_market"
  | "single_incumbent"
  | "multi_provider"
  | "uncertain";

export type MatchConfidence = "high" | "medium" | "low" | "unknown";

export type InteractionType =
  | "call_inbound"
  | "call_outbound"
  | "voicemail"
  | "email_inbound"
  | "email_outbound"
  | "meeting"
  | "demo"
  | "note";

export type CallOutcome =
  | "connected"
  | "no_answer"
  | "left_voicemail"
  | "meeting_scheduled"
  | "demo_scheduled"
  | "demo_completed"
  | "not_interested"
  | "follow_up_needed"
  | "closed_won"
  | "closed_lost";

export type ReviewStatus = "open" | "approved" | "rejected" | "deferred";

export type RunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "partial";

export interface Facility {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  county: string;
  state: string;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  parcel_pin: string | null;
  website_url: string | null;
  operator: string | null;
  ownership_type: string | null;
  facility_type: string | null;
  size_class: SizeClass;
  size_confidence: SizeConfidence;
  unit_count: number | null;
  unit_count_type: string | null;
  estimated_units: number | null;
  estimated_units_low: number | null;
  estimated_units_high: number | null;
  licensed_beds: number | null;
  building_sqft: number | null;
  acreage: number | null;
  assessed_value: number | null;
  property_use_code: string | null;
  property_record_url: string | null;
  year_built: number | null;
  ai_outreach_status: AIOutreachStatus;
  ai_outreach_status_changed_at: string | null;
  ai_last_contact_at: string | null;
  ai_current_software: string | null;
  ai_pain_points: string | null;
  ai_estimated_deal_size_cents: number | null;
  ai_priority: AIPriority;
  created_at: string;
  updated_at: string;
  internal_notes: string | null;
}

export interface Contact {
  id: string;
  facility_id: string;
  name: string;
  title: string | null;
  is_primary: boolean;
  phone: string | null;
  phone_direct: string | null;
  email: string | null;
  linkedin_url: string | null;
  data_source: string | null;
  source_url: string | null;
  verified_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CallNote {
  id: string;
  facility_id: string;
  contact_id: string | null;
  interaction_type: InteractionType;
  interaction_date: string;
  duration_minutes: number | null;
  summary: string;
  outcome: CallOutcome | null;
  ai_solutions_pitched: string[] | null;
  follow_up_at: string | null;
  follow_up_done: boolean;
  logged_by: string | null;
  created_at: string;
}

export interface FacilitySource {
  id: string;
  facility_id: string;
  source_type: string;
  source_url: string | null;
  extracted_value: unknown;
  confidence: string | null;
  fetched_at: string;
  notes: string | null;
}

export interface TherapyProvider {
  id: string;
  npi: string | null;
  organization_name: string;
  parent_organization: string | null;
  taxonomy_code: string | null;
  taxonomy_description: string | null;
  primary_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  is_active: boolean;
  first_seen_at: string;
  last_verified_at: string;
}

export interface FacilityTherapyMatch {
  id: string;
  facility_id: string;
  provider_id: string;
  match_confidence: MatchConfidence;
  match_evidence: string | null;
  evidence_url: string | null;
  named_provider: string | null;
  is_current: boolean;
  first_observed_at: string;
  last_observed_at: string;
}

export interface ReviewQueueItem {
  id: string;
  facility_id: string;
  reason: string;
  details: Record<string, unknown> | null;
  status: ReviewStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
}

export interface MonthlyRun {
  id: string;
  run_type: string;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  facilities_processed: number;
  facilities_changed: number;
  new_facilities_added: number;
  pt_providers_added: number;
  pt_provider_changes: number;
  errors: unknown;
  triggered_by: string | null;
}

export interface FacilityPTSummary {
  facility_id: string;
  name: string;
  city: string | null;
  size_class: SizeClass;
  unit_count: number | null;
  confirmed_pt_provider_count: number;
  confirmed_pt_providers: string[] | null;
  pt_market_status: PTMarketStatus;
}

export interface PTProviderFootprint {
  provider_id: string;
  npi: string | null;
  organization_name: string;
  parent_organization: string | null;
  // The footprint view now lists only organizations / PT companies.
  entity_type: string | null;
  taxonomy_description: string | null;
  active_facility_count: number;
  qualified_facility_count: number;
  facility_names: string[] | null;
  last_observed_at: string | null;
}
