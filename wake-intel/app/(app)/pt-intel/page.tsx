import { Activity } from "lucide-react";

import { StatStrip, type Stat } from "@/components/stat-strip";
import { ExportButton } from "@/components/export-button";
import { FacilityPTSummaryTable } from "@/components/facility-pt-summary-table";
import { PTProviderTable } from "@/components/pt-provider-table";
import { formatDate } from "@/lib/domain";
import {
  getFacilityPTSummary,
  getLastSyncAt,
  getPTProviderFootprint,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "PT Market Intel" };

export default async function PTIntelPage() {
  const [summary, providers, lastSync] = await Promise.all([
    getFacilityPTSummary(),
    getPTProviderFootprint(),
    getLastSyncAt(),
  ]);

  const total = summary.length;
  const withPT = summary.filter(
    (s) => s.pt_market_status !== "open_market",
  ).length;
  const openMarket = summary.filter(
    (s) => s.pt_market_status === "open_market",
  ).length;
  const activeProviders = providers.filter(
    (p) => p.active_facility_count > 0,
  ).length;

  const stats: Stat[] = [
    { label: "Qualified facilities", value: total, accent: "teal" },
    { label: "With a PT incumbent", value: withPT, accent: "amber" },
    { label: "Open market (no incumbent)", value: openMarket, accent: "emerald" },
    { label: "Active PT companies", value: activeProviders, accent: "teal" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 sm:px-6">
      {/* Distinct PT top bar (teal treatment) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-teal-900">
            <Activity className="h-5 w-5 text-teal-600" />
            Wake County PT Market
          </h1>
          <p className="text-sm text-teal-700/80">
            PT companies incumbent in Wake senior living ·{" "}
            <span className="whitespace-nowrap">open market = no PT company incumbent</span>{" "}
            · last refresh {lastSync ? formatDate(lastSync) : "never"}
          </p>
        </div>
        <ExportButton
          href="/api/exports/pt-intel"
          label="Export PT CSV"
          accent="teal"
        />
      </div>

      <StatStrip stats={stats} />

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Facilities by PT incumbency</h2>
          <FacilityPTSummaryTable rows={summary} />
        </section>
        <section className="space-y-2">
          <h2 className="text-base font-semibold">
            PT companies active in Wake senior living
          </h2>
          <PTProviderTable providers={providers} />
        </section>
      </div>
    </div>
  );
}
