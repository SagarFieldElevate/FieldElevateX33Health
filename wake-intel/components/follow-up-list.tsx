"use client";

import * as React from "react";
import Link from "next/link";
import { Check, CalendarClock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/ai-pipeline-badge";
import {
  CALL_OUTCOME_LABEL,
  formatDate,
  relativeDays,
} from "@/lib/domain";
import { markFollowUpDone } from "@/app/actions";
import type { OpenFollowUp } from "@/lib/queries";

export function FollowUpList({ items }: { items: OpenFollowUp[] }) {
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  async function complete(item: OpenFollowUp) {
    setPendingId(item.id);
    const res = await markFollowUpDone(item.id, item.facility_id);
    setPendingId(null);
    if (!res.error) {
      setHidden((s) => new Set(s).add(item.id));
    }
  }

  const visible = items.filter((i) => !hidden.has(i.id));

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
        No open follow-ups. You&apos;re all caught up.
      </div>
    );
  }

  const now = Date.now();

  return (
    <ul className="space-y-2">
      {visible.map((item) => {
        const due = item.follow_up_at
          ? new Date(item.follow_up_at).getTime()
          : null;
        const overdue = due != null && due < now;
        return (
          <li
            key={item.id}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3",
              overdue && "border-rose-200",
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                overdue
                  ? "bg-rose-100 text-rose-600"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <CalendarClock className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/facility/${item.facility_id}`}
                  className="truncate font-medium hover:underline"
                >
                  {item.facility?.name ?? "Facility"}
                </Link>
                {item.facility?.ai_priority && (
                  <PriorityBadge priority={item.facility.ai_priority} />
                )}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {item.summary}
              </p>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {item.outcome && (
                  <span>{CALL_OUTCOME_LABEL[item.outcome]} · </span>
                )}
                {item.contact?.name && <span>{item.contact.name} · </span>}
                <span className={cn(overdue && "font-medium text-rose-600")}>
                  due {formatDate(item.follow_up_at)} (
                  {relativeDays(item.follow_up_at)})
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pendingId === item.id}
              onClick={() => complete(item)}
            >
              <Check className="mr-1.5 h-4 w-4" />
              {pendingId === item.id ? "…" : "Done"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
