"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type {
  CallOutcome,
  InteractionType,
  ReviewStatus,
  SizeClass,
} from "@/lib/types";

export interface LogCallInput {
  facility_id: string;
  contact_id: string | null;
  interaction_type: InteractionType;
  interaction_date: string; // ISO
  duration_minutes: number | null;
  summary: string;
  outcome: CallOutcome | null;
  ai_solutions_pitched: string[];
  follow_up_at: string | null; // ISO or null
}

export async function logCall(input: LogCallInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("fe33_call_notes").insert({
    facility_id: input.facility_id,
    contact_id: input.contact_id,
    interaction_type: input.interaction_type,
    interaction_date: input.interaction_date,
    duration_minutes: input.duration_minutes,
    summary: input.summary,
    outcome: input.outcome,
    ai_solutions_pitched:
      input.ai_solutions_pitched.length > 0
        ? input.ai_solutions_pitched
        : null,
    follow_up_at: input.follow_up_at,
    logged_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  // The DB trigger rolls facility status/last-contact up automatically.
  revalidatePath("/");
  revalidatePath(`/facility/${input.facility_id}`);
  revalidatePath("/follow-ups");
  return { error: null };
}

export async function markFollowUpDone(noteId: string, facilityId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("fe33_call_notes")
    .update({ follow_up_done: true })
    .eq("id", noteId);

  if (error) return { error: error.message };
  revalidatePath("/follow-ups");
  revalidatePath(`/facility/${facilityId}`);
  return { error: null };
}

export interface ResolveReviewInput {
  reviewId: string;
  facilityId: string;
  action: "approve" | "reject" | "defer" | "override";
  notes: string;
  // For approve/override: optionally set a size class.
  sizeClass?: SizeClass | null;
}

export async function resolveReview(input: ResolveReviewInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const statusMap: Record<ResolveReviewInput["action"], ReviewStatus> = {
    approve: "approved",
    reject: "rejected",
    defer: "deferred",
    override: "approved",
  };

  // Side effects on the facility per spec §4.4.
  if (input.action === "reject") {
    const { error: fErr } = await supabase
      .from("fe33_facilities")
      .update({ ai_outreach_status: "disqualified" })
      .eq("id", input.facilityId);
    if (fErr) return { error: fErr.message };
  } else if (
    (input.action === "approve" || input.action === "override") &&
    input.sizeClass
  ) {
    const { error: fErr } = await supabase
      .from("fe33_facilities")
      .update({ size_class: input.sizeClass })
      .eq("id", input.facilityId);
    if (fErr) return { error: fErr.message };
  }

  const { error } = await supabase
    .from("fe33_review_queue")
    .update({
      status: statusMap[input.action],
      resolution_notes: input.notes || null,
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id ?? null,
    })
    .eq("id", input.reviewId);

  if (error) return { error: error.message };

  revalidatePath("/review");
  revalidatePath(`/facility/${input.facilityId}`);
  revalidatePath("/");
  return { error: null };
}
