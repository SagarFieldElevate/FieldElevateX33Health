import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RunActions } from "@/components/run-actions";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/domain";
import { getMonthlyRuns } from "@/lib/queries";
import type { RunStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reports" };

function statusTone(status: RunStatus) {
  switch (status) {
    case "succeeded":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "running":
    case "pending":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "partial":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "failed":
      return "bg-rose-100 text-rose-700 border-rose-200";
  }
}

export default async function ReportsPage() {
  const runs = await getMonthlyRuns();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Monthly reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Each monthly refresh run and its AI sales report.
          </p>
        </div>
        <RunActions />
      </div>

      {runs.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          No runs yet. Trigger a monthly update to generate the first report.
        </div>
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/reports/${run.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {formatDateTime(run.started_at)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("capitalize", statusTone(run.status))}
                    >
                      {run.status}
                    </Badge>
                    <span className="text-xs capitalize text-muted-foreground">
                      {run.run_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {run.facilities_processed} processed ·{" "}
                    {run.facilities_changed} changed ·{" "}
                    {run.new_facilities_added} new
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
