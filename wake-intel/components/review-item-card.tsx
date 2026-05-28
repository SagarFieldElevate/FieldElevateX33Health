"use client";

import * as React from "react";
import Link from "next/link";
import { Check, X, Clock, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SizeBadge } from "@/components/size-badge";
import { AIPipelineBadge } from "@/components/ai-pipeline-badge";
import { Badge } from "@/components/ui/badge";
import {
  REVIEW_REASON_LABEL,
  SIZE_CLASS_LABEL,
} from "@/lib/domain";
import { resolveReview, type ResolveReviewInput } from "@/app/actions";
import type { ReviewItemWithFacility } from "@/lib/queries";
import type { SizeClass } from "@/lib/types";

const SIZE_CLASSES: SizeClass[] = [
  "confirmed_100_plus",
  "likely_100_plus",
  "possible_100_plus",
  "likely_under_100",
  "confirmed_under_100",
  "unknown",
];

export function ReviewItemCard({ item }: { item: ReviewItemWithFacility }) {
  const [pending, setPending] = React.useState(false);
  const [resolved, setResolved] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [sizeClass, setSizeClass] = React.useState<SizeClass>(
    item.facility?.size_class ?? "unknown",
  );
  const [error, setError] = React.useState<string | null>(null);

  async function act(action: ResolveReviewInput["action"]) {
    setPending(true);
    setError(null);
    const res = await resolveReview({
      reviewId: item.id,
      facilityId: item.facility_id,
      action,
      notes,
      sizeClass:
        action === "approve" || action === "override" ? sizeClass : null,
    });
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResolved(true);
  }

  if (resolved) return null;

  const details = item.details ?? {};
  const detailEntries = Object.entries(details);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/facility/${item.facility_id}`}
              className="font-medium hover:underline"
            >
              {item.facility?.name ?? "Facility"}
            </Link>
            {item.facility && (
              <SizeBadge sizeClass={item.facility.size_class} />
            )}
            {item.facility && (
              <AIPipelineBadge status={item.facility.ai_outreach_status} />
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {item.facility?.city ?? "Wake County"}
          </div>
        </div>
        <Badge variant="outline" className="capitalize">
          {REVIEW_REASON_LABEL[item.reason] ?? item.reason.replace(/_/g, " ")}
        </Badge>
      </div>

      {detailEntries.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-3 text-xs sm:grid-cols-3">
          {detailEntries.map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-[200px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`size-${item.id}`} className="text-xs">
            Set size class
          </Label>
          <Select
            id={`size-${item.id}`}
            value={sizeClass}
            onChange={(e) => setSizeClass(e.target.value as SizeClass)}
            className="h-9"
          >
            {SIZE_CLASSES.map((s) => (
              <option key={s} value={s}>
                {SIZE_CLASS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`notes-${item.id}`} className="text-xs">
            Resolution notes
          </Label>
          <Input
            id={`notes-${item.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional context for the audit log"
            className="h-9"
          />
        </div>
      </div>

      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => act("approve")}>
          <Check className="mr-1.5 h-4 w-4" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => act("override")}
        >
          <Pencil className="mr-1.5 h-4 w-4" />
          Override
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => act("defer")}
        >
          <Clock className="mr-1.5 h-4 w-4" />
          Defer
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => act("reject")}
          className={cn(pending && "opacity-60")}
        >
          <X className="mr-1.5 h-4 w-4" />
          Reject
        </Button>
      </div>
    </div>
  );
}
