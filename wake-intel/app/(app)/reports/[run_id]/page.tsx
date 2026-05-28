import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { StatStrip, type Stat } from "@/components/stat-strip";
import { SizeDot } from "@/components/size-badge";
import { PriorityBadge, AIPipelineBadge } from "@/components/ai-pipeline-badge";
import { formatDateTime, formatNumber } from "@/lib/domain";
import { getFacilities, getMonthlyRun } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Report" };

export default async function ReportDetailPage({
  params,
}: {
  params: { run_id: string };
}) {
  const run = await getMonthlyRun(params.run_id);
  if (!run) notFound();

  const facilities = await getFacilities();

  // Top cold leads (qualified, never contacted) — the report's call-to-action list.
  const coldLeads = facilities
    .filter(
      (f) =>
        f.ai_priority === "cold" &&
        f.ai_outreach_status === "not_contacted",
    )
    .sort(
      (a, b) =>
        (b.ai_estimated_deal_size_cents ?? 0) -
        (a.ai_estimated_deal_size_cents ?? 0),
    )
    .slice(0, 5);

  const stats: Stat[] = [
    { label: "Processed", value: run.facilities_processed },
    { label: "Changed", value: run.facilities_changed, accent: "amber" },
    {
      label: "New facilities",
      value: run.new_facilities_added,
      accent: "emerald",
    },
    {
      label: "PT providers added",
      value: run.pt_providers_added,
      accent: "teal",
    },
    { label: "PT changes", value: run.pt_provider_changes, accent: "sky" },
    {
      label: "Errors",
      value: Array.isArray(run.errors) ? run.errors.length : 0,
      accent: "rose",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Reports
        </Link>
      </div>

      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          Wake County AI Sales Report
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {formatDateTime(run.started_at)}
        </h1>
        <p className="text-sm capitalize text-muted-foreground">
          {run.run_type.replace(/_/g, " ")} · {run.status}
          {run.finished_at &&
            ` · finished ${formatDateTime(run.finished_at)}`}
        </p>
      </header>

      <StatStrip stats={stats} />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Top 5 priority cold leads</h2>
        {coldLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No qualified, uncontacted leads outstanding.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Facility</th>
                  <th className="px-3 py-2 font-medium">Units</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {coldLeads.map((f) => (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <SizeDot sizeClass={f.size_class} />
                        <Link
                          href={`/facility/${f.id}`}
                          className="font-medium hover:underline"
                        >
                          {f.name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {formatNumber(f.unit_count)}
                    </td>
                    <td className="px-3 py-2.5">
                      <PriorityBadge priority={f.ai_priority} />
                    </td>
                    <td className="px-3 py-2.5">
                      <AIPipelineBadge status={f.ai_outreach_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {Array.isArray(run.errors) && run.errors.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Errors</h2>
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">
            {JSON.stringify(run.errors, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
