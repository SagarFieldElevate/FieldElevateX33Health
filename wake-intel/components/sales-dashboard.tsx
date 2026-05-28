"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SizeDot } from "@/components/size-badge";
import { PriorityBadge, AIPipelineBadge } from "@/components/ai-pipeline-badge";
import { FacilityDetailPanel } from "@/components/facility-detail-panel";
import {
  formatNumber,
  isQualified,
  relativeDays,
} from "@/lib/domain";
import type { CallNote, Contact, Facility } from "@/lib/types";

type FilterTab = "all" | "qualified" | "hot" | "cold" | "review";

const TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "qualified", label: "Qualified" },
  { id: "hot", label: "Hot" },
  { id: "cold", label: "Cold" },
  { id: "review", label: "Review" },
];

export function SalesDashboard({
  facilities,
  contactsByFacility,
  latestNoteByFacility,
  ptCountByFacility,
  reviewFacilityIds,
}: {
  facilities: Facility[];
  contactsByFacility: Record<string, Contact[]>;
  latestNoteByFacility: Record<string, CallNote | undefined>;
  ptCountByFacility: Record<string, number>;
  reviewFacilityIds: string[];
}) {
  const [tab, setTab] = React.useState<FilterTab>("all");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(
    facilities[0]?.id ?? null,
  );

  const reviewSet = React.useMemo(
    () => new Set(reviewFacilityIds),
    [reviewFacilityIds],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return facilities.filter((f) => {
      if (tab === "qualified" && !isQualified(f.size_class)) return false;
      if (tab === "hot" && f.ai_priority !== "hot") return false;
      if (tab === "cold" && f.ai_priority !== "cold") return false;
      if (tab === "review" && !reviewSet.has(f.id)) return false;
      if (q) {
        const hay = `${f.name} ${f.city ?? ""} ${f.operator ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [facilities, tab, query, reviewSet]);

  const selected =
    facilities.find((f) => f.id === selectedId) ?? filtered[0] ?? null;

  const tabCount = (id: FilterTab) => {
    switch (id) {
      case "all":
        return facilities.length;
      case "qualified":
        return facilities.filter((f) => isQualified(f.size_class)).length;
      case "hot":
        return facilities.filter((f) => f.ai_priority === "hot").length;
      case "cold":
        return facilities.filter((f) => f.ai_priority === "cold").length;
      case "review":
        return reviewSet.size;
    }
  };

  const selectedNotes = selected
    ? [latestNoteByFacility[selected.id]].filter(Boolean) as CallNote[]
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* Left pane: filters + table */}
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "ml-1.5 text-xs",
                    tab === t.id
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground/70",
                  )}
                >
                  {tabCount(t.id)}
                </span>
              </button>
            ))}
          </div>
          <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search facilities…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Facility</th>
                  <th className="px-3 py-2 font-medium">Units</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">
                    Primary contact
                  </th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">
                    Last contact
                  </th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      No facilities match this view.
                    </td>
                  </tr>
                )}
                {filtered.map((f) => {
                  const primary =
                    (contactsByFacility[f.id] ?? []).find(
                      (c) => c.is_primary,
                    ) ?? (contactsByFacility[f.id] ?? [])[0];
                  const active = selected?.id === f.id;
                  return (
                    <tr
                      key={f.id}
                      onClick={() => setSelectedId(f.id)}
                      className={cn(
                        "cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40",
                        active && "bg-muted/60",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <SizeDot sizeClass={f.size_class} />
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {f.name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {f.city ?? "Wake County"}
                              {f.operator ? ` · ${f.operator}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {formatNumber(f.unit_count)}
                      </td>
                      <td className="px-3 py-2.5">
                        <PriorityBadge priority={f.ai_priority} />
                      </td>
                      <td className="hidden px-3 py-2.5 md:table-cell">
                        {primary ? (
                          <div className="min-w-0">
                            <div className="truncate">{primary.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {primary.title ?? ""}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">
                        {relativeDays(f.ai_last_contact_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <AIPipelineBadge status={f.ai_outreach_status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right pane: detail */}
      <aside className="lg:sticky lg:top-[4.5rem] lg:h-fit">
        <div className="rounded-lg border bg-card p-4">
          <FacilityDetailPanel
            facility={selected}
            contacts={selected ? contactsByFacility[selected.id] ?? [] : []}
            notes={selectedNotes}
            ptProviderCount={selected ? ptCountByFacility[selected.id] ?? 0 : 0}
          />
        </div>
      </aside>
    </div>
  );
}
