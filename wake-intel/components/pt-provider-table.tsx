import Link from "next/link";

import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/domain";
import type { MatchConfidence, PTProviderFootprint } from "@/lib/types";

export function MatchConfidenceBadge({
  confidence,
  className,
}: {
  confidence: MatchConfidence;
  className?: string;
}) {
  const tone =
    confidence === "high"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : confidence === "medium"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : confidence === "low"
          ? "bg-rose-100 text-rose-700 border-rose-200"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        tone,
        className,
      )}
    >
      {confidence}
    </span>
  );
}

export function PTProviderTable({
  providers,
}: {
  providers: PTProviderFootprint[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">PT company</th>
              <th className="px-3 py-2 font-medium">Facilities</th>
              <th className="px-3 py-2 font-medium">Qualified</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">
                Last seen
              </th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No PT companies tracked yet.
                </td>
              </tr>
            )}
            {providers.map((p) => (
              <tr
                key={p.provider_id}
                className="border-b last:border-0 hover:bg-muted/40"
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/pt-intel/providers/${p.provider_id}`}
                    className="font-medium text-teal-700 hover:underline"
                  >
                    {p.organization_name}
                  </Link>
                  {p.parent_organization && (
                    <div className="text-xs text-muted-foreground">
                      {p.parent_organization}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {formatNumber(p.active_facility_count)}
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {formatNumber(p.qualified_facility_count)}
                </td>
                <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">
                  {formatDate(p.last_observed_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
