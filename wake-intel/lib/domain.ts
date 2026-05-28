// Domain helpers: labels, colors, formatting, and qualification logic.
import type {
  AIOutreachStatus,
  AIPriority,
  CallOutcome,
  InteractionType,
  PTMarketStatus,
  SizeClass,
} from "@/lib/types";

export const QUALIFIED_SIZE_CLASSES: SizeClass[] = [
  "confirmed_100_plus",
  "likely_100_plus",
];

// Size classes that show up in the PT summary view (per the view definition).
export const PT_TRACKED_SIZE_CLASSES: SizeClass[] = [
  "confirmed_100_plus",
  "likely_100_plus",
  "possible_100_plus",
];

export const SIZE_CLASS_LABEL: Record<SizeClass, string> = {
  confirmed_100_plus: "Confirmed 100+",
  likely_100_plus: "Likely 100+",
  possible_100_plus: "Possible 100+",
  likely_under_100: "Likely <100",
  confirmed_under_100: "Confirmed <100",
  unknown: "Unknown",
};

// A 1-5 strength scale used to render the size "dot".
export const SIZE_CLASS_STRENGTH: Record<SizeClass, number> = {
  confirmed_100_plus: 5,
  likely_100_plus: 4,
  possible_100_plus: 3,
  unknown: 2,
  likely_under_100: 1,
  confirmed_under_100: 0,
};

// Tailwind text/bg color tokens for the size dot.
export function sizeDotColor(sizeClass: SizeClass): string {
  switch (sizeClass) {
    case "confirmed_100_plus":
      return "bg-emerald-500";
    case "likely_100_plus":
      return "bg-emerald-400";
    case "possible_100_plus":
      return "bg-amber-400";
    case "unknown":
      return "bg-muted-foreground/40";
    case "likely_under_100":
      return "bg-orange-400";
    case "confirmed_under_100":
      return "bg-rose-400";
  }
}

export const AI_PRIORITY_LABEL: Record<AIPriority, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  dead: "Dead",
};

export function priorityClasses(priority: AIPriority): string {
  switch (priority) {
    case "hot":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "warm":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "cold":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "dead":
      return "bg-muted text-muted-foreground border-border";
  }
}

export const AI_STATUS_LABEL: Record<AIOutreachStatus, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  demo_scheduled: "Demo scheduled",
  demo_done: "Demo done",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  disqualified: "Disqualified",
};

// Ordered pipeline stages for the AI pipeline badge / progress.
export const AI_PIPELINE_STAGES: AIOutreachStatus[] = [
  "not_contacted",
  "contacted",
  "demo_scheduled",
  "demo_done",
  "proposal_sent",
  "negotiating",
  "won",
];

export function statusClasses(status: AIOutreachStatus): string {
  switch (status) {
    case "won":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "negotiating":
    case "proposal_sent":
      return "bg-violet-100 text-violet-700 border-violet-200";
    case "demo_done":
    case "demo_scheduled":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "contacted":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "lost":
    case "disqualified":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "not_contacted":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export const PT_MARKET_STATUS_LABEL: Record<PTMarketStatus, string> = {
  open_market: "Open market",
  single_incumbent: "Single incumbent",
  multi_provider: "Multi-provider",
  uncertain: "Uncertain",
};

export function ptMarketStatusClasses(status: PTMarketStatus): string {
  switch (status) {
    case "open_market":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "single_incumbent":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "multi_provider":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "uncertain":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export const INTERACTION_TYPE_LABEL: Record<InteractionType, string> = {
  call_inbound: "Inbound call",
  call_outbound: "Outbound call",
  voicemail: "Voicemail",
  email_inbound: "Inbound email",
  email_outbound: "Outbound email",
  meeting: "Meeting",
  demo: "Demo",
  note: "Note",
};

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  connected: "Connected",
  no_answer: "No answer",
  left_voicemail: "Left voicemail",
  meeting_scheduled: "Meeting scheduled",
  demo_scheduled: "Demo scheduled",
  demo_completed: "Demo completed",
  not_interested: "Not interested",
  follow_up_needed: "Follow-up needed",
  closed_won: "Closed won",
  closed_lost: "Closed lost",
};

export const AI_SOLUTION_OPTIONS: { value: string; label: string }[] = [
  { value: "scheduling", label: "Scheduling" },
  { value: "intake_automation", label: "Intake automation" },
  { value: "family_portal", label: "Family portal" },
  { value: "maintenance_triage", label: "Maintenance triage" },
  { value: "staff_comms", label: "Staff comms" },
  { value: "resident_engagement", label: "Resident engagement" },
  { value: "ops_dashboard", label: "Ops dashboard" },
  { value: "other", label: "Other" },
];

export const REVIEW_REASON_LABEL: Record<string, string> = {
  unknown_size: "Unknown size",
  conflicting_signals: "Conflicting signals",
  low_confidence_therapy: "Low-confidence therapy",
  new_facility_unverified: "New facility unverified",
  stale_contact: "Stale contact",
  pt_provider_change: "PT provider change",
};

export function isQualified(sizeClass: SizeClass): boolean {
  return QUALIFIED_SIZE_CLASSES.includes(sizeClass);
}

// ---- Formatting helpers ----

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeDays(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "never";
  const diffMs = Date.now() - d;
  const day = 24 * 60 * 60 * 1000;
  const days = Math.round(diffMs / day);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days > 0) return `${days}d ago`;
  const ahead = Math.abs(days);
  if (ahead === 1) return "tomorrow";
  return `in ${ahead}d`;
}
