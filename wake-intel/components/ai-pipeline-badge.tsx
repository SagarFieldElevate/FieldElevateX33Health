import { cn } from "@/lib/utils";
import {
  AI_PIPELINE_STAGES,
  AI_PRIORITY_LABEL,
  AI_STATUS_LABEL,
  priorityClasses,
  statusClasses,
} from "@/lib/domain";
import type { AIOutreachStatus, AIPriority } from "@/lib/types";

export function PriorityBadge({
  priority,
  className,
}: {
  priority: AIPriority;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        priorityClasses(priority),
        className,
      )}
    >
      {AI_PRIORITY_LABEL[priority]}
    </span>
  );
}

export function AIPipelineBadge({
  status,
  className,
}: {
  status: AIOutreachStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        statusClasses(status),
        className,
      )}
    >
      {AI_STATUS_LABEL[status]}
    </span>
  );
}

// Visual pipeline progress (used in the detail panel).
export function AIPipelineProgress({ status }: { status: AIOutreachStatus }) {
  const terminalLost = status === "lost" || status === "disqualified";
  const idx = AI_PIPELINE_STAGES.indexOf(status);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {AI_PIPELINE_STAGES.map((stage, i) => {
          const reached = idx >= 0 && i <= idx;
          return (
            <div
              key={stage}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                terminalLost
                  ? "bg-rose-200"
                  : reached
                    ? "bg-primary"
                    : "bg-muted",
              )}
              title={AI_STATUS_LABEL[stage]}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <AIPipelineBadge status={status} />
      </div>
    </div>
  );
}
