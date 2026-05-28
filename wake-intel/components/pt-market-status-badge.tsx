import { cn } from "@/lib/utils";
import {
  PT_MARKET_STATUS_LABEL,
  ptMarketStatusClasses,
} from "@/lib/domain";
import type { PTMarketStatus } from "@/lib/types";

export function PTMarketStatusBadge({
  status,
  className,
}: {
  status: PTMarketStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        ptMarketStatusClasses(status),
        className,
      )}
    >
      {PT_MARKET_STATUS_LABEL[status] ?? status}
    </span>
  );
}
