import { RefreshCw } from "lucide-react";

import { StatStrip, type Stat } from "@/components/stat-strip";
import { RunActions } from "@/components/run-actions";
import { SalesDashboard } from "@/components/sales-dashboard";
import { ExportButton } from "@/components/export-button";
import {
  getContactsForFacilities,
  getFacilities,
  getLastSyncAt,
  getLatestNotesByFacility,
  getMatchesForFacilitiesCount,
  getOpenFollowUps,
  getOpenReviewItems,
} from "@/lib/queries";
import { formatDate, isQualified } from "@/lib/domain";
import type { CallNote, Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SalesDashboardPage() {
  const facilities = await getFacilities();
  const ids = facilities.map((f) => f.id);

  const [contacts, latestNotes, lastSync, reviewItems, followUps, ptCounts] =
    await Promise.all([
      getContactsForFacilities(ids),
      getLatestNotesByFacility(),
      getLastSyncAt(),
      getOpenReviewItems(),
      getOpenFollowUps(),
      getMatchesForFacilitiesCount(ids),
    ]);

  const contactsByFacility: Record<string, Contact[]> = {};
  for (const c of contacts) {
    (contactsByFacility[c.facility_id] ??= []).push(c);
  }

  const latestNoteByFacility: Record<string, CallNote | undefined> = {};
  latestNotes.forEach((note, fid) => {
    latestNoteByFacility[fid] = note;
  });

  const reviewFacilityIds = Array.from(
    new Set(reviewItems.map((r) => r.facility_id)),
  );

  // Stats strip
  const total = facilities.length;
  const confirmed100 = facilities.filter(
    (f) => f.size_class === "confirmed_100_plus",
  ).length;
  const qualified = facilities.filter((f) => isQualified(f.size_class)).length;
  const hot = facilities.filter((f) => f.ai_priority === "hot").length;
  const warm = facilities.filter((f) => f.ai_priority === "warm").length;
  const dueNow = followUps.filter(
    (fu) => fu.follow_up_at && new Date(fu.follow_up_at) <= new Date(),
  ).length;

  const stats: Stat[] = [
    { label: "Total", value: total },
    { label: "Confirmed 100+", value: confirmed100, accent: "emerald" },
    { label: "Qualified", value: qualified, accent: "emerald" },
    { label: "Hot", value: hot, accent: "rose" },
    { label: "Warm", value: warm, accent: "amber" },
    { label: "Follow-ups due", value: dueNow, accent: "sky" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 sm:px-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            AI Sales Pipeline
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            Last sync: {lastSync ? formatDate(lastSync) : "never"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton
            href="/api/exports/sales-pipeline"
            label="Export CSV"
          />
          <RunActions />
        </div>
      </div>

      <StatStrip stats={stats} />

      <SalesDashboard
        facilities={facilities}
        contactsByFacility={contactsByFacility}
        latestNoteByFacility={latestNoteByFacility}
        ptCountByFacility={ptCounts}
        reviewFacilityIds={reviewFacilityIds}
      />
    </div>
  );
}
