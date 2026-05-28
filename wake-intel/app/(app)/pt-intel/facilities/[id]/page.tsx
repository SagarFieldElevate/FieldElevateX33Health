import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SizeBadge } from "@/components/size-badge";
import { PTMarketStatusBadge } from "@/components/pt-market-status-badge";
import { MatchConfidenceBadge } from "@/components/pt-provider-table";
import { formatDate, formatNumber } from "@/lib/domain";
import {
  getFacility,
  getFacilityPTSummaryOne,
  getMatchesForFacility,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "PT facility view" };

export default async function PTFacilityPage({
  params,
}: {
  params: { id: string };
}) {
  const facility = await getFacility(params.id);
  if (!facility) notFound();

  const [summary, matches] = await Promise.all([
    getFacilityPTSummaryOne(params.id),
    getMatchesForFacility(params.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-5 px-4 py-5 sm:px-6">
      <Link
        href="/pt-intel"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        PT market
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-teal-900">
            {facility.name}
          </h1>
          <SizeBadge
            sizeClass={facility.size_class}
            unitCount={facility.unit_count}
          />
          {summary && (
            <PTMarketStatusBadge status={summary.pt_market_status} />
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {[facility.city, facility.state].filter(Boolean).join(", ") ||
            "Wake County, NC"}
          {" · "}
          {formatNumber(facility.unit_count)} units
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>PT companies on record</CardTitle>
        </CardHeader>
        <CardContent>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No PT company incumbent for this facility — open market.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">PT company</th>
                    <th className="px-3 py-2 font-medium">Confidence</th>
                    <th className="px-3 py-2 font-medium">Observed</th>
                    <th className="px-3 py-2 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/pt-intel/providers/${m.provider_id}`}
                          className="font-medium text-teal-700 hover:underline"
                        >
                          {m.provider?.organization_name ??
                            m.named_provider ??
                            "Unknown provider"}
                        </Link>
                        {m.provider?.parent_organization && (
                          <div className="text-xs text-muted-foreground">
                            {m.provider.parent_organization}
                          </div>
                        )}
                        {!m.is_current && (
                          <span className="text-xs text-muted-foreground">
                            former
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <MatchConfidenceBadge confidence={m.match_confidence} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {formatDate(m.first_observed_at)} →{" "}
                        {formatDate(m.last_observed_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        {m.evidence_url ? (
                          <a
                            href={m.evidence_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-teal-700 hover:underline"
                          >
                            {m.match_evidence ?? "link"}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">
                            {m.match_evidence ?? "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Link
        href={`/facility/${facility.id}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        View full sales profile →
      </Link>
    </div>
  );
}
