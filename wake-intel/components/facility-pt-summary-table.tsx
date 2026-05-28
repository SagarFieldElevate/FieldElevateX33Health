"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { SizeDot } from "@/components/size-badge";
import { PTMarketStatusBadge } from "@/components/pt-market-status-badge";
import {
  SIZE_CLASS_LABEL,
  PT_MARKET_STATUS_LABEL,
  formatNumber,
} from "@/lib/domain";
import type {
  FacilityPTSummary,
  PTMarketStatus,
  SizeClass,
} from "@/lib/types";

export function FacilityPTSummaryTable({
  rows,
}: {
  rows: FacilityPTSummary[];
}) {
  const [status, setStatus] = React.useState<PTMarketStatus | "all">("all");
  const [size, setSize] = React.useState<SizeClass | "all">("all");

  const filtered = rows.filter((r) => {
    if (status !== "all" && r.pt_market_status !== status) return false;
    if (size !== "all" && r.size_class !== size) return false;
    return true;
  });

  const sizeOptions = Array.from(new Set(rows.map((r) => r.size_class)));
  const statusOptions = Array.from(
    new Set(rows.map((r) => r.pt_market_status)),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as PTMarketStatus | "all")
          }
          className="h-9 w-auto"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {PT_MARKET_STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </Select>
        <Select
          value={size}
          onChange={(e) => setSize(e.target.value as SizeClass | "all")}
          className="h-9 w-auto"
        >
          <option value="all">All sizes</option>
          {sizeOptions.map((s) => (
            <option key={s} value={s}>
              {SIZE_CLASS_LABEL[s]}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Facility</th>
                <th className="px-3 py-2 font-medium">Units</th>
                <th className="px-3 py-2 font-medium">PT status</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  Confirmed providers
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    No facilities match these filters.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.facility_id}
                  className="border-b last:border-0 hover:bg-muted/40"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <SizeDot sizeClass={r.size_class} />
                      <Link
                        href={`/pt-intel/facilities/${r.facility_id}`}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                    </div>
                    <div className="pl-4 text-xs text-muted-foreground">
                      {r.city ?? "Wake County"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {formatNumber(r.unit_count)}
                  </td>
                  <td className="px-3 py-2.5">
                    <PTMarketStatusBadge status={r.pt_market_status} />
                  </td>
                  <td
                    className={cn(
                      "hidden px-3 py-2.5 text-muted-foreground md:table-cell",
                    )}
                  >
                    {r.confirmed_pt_providers &&
                    r.confirmed_pt_providers.filter(Boolean).length > 0
                      ? r.confirmed_pt_providers.filter(Boolean).join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
