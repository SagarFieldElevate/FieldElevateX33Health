import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SizeBadge } from "@/components/size-badge";
import { MatchConfidenceBadge } from "@/components/pt-provider-table";
import { formatDate, formatNumber } from "@/lib/domain";
import {
  getMatchesForProvider,
  getTherapyProvider,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "PT provider" };

export default async function PTProviderPage({
  params,
}: {
  params: { id: string };
}) {
  const provider = await getTherapyProvider(params.id);
  if (!provider) notFound();

  const matches = await getMatchesForProvider(params.id);
  const current = matches.filter((m) => m.is_current);
  const qualified = current.filter(
    (m) =>
      m.facility?.size_class === "confirmed_100_plus" ||
      m.facility?.size_class === "likely_100_plus",
  ).length;
  const firstObserved = matches.reduce<string | null>((min, m) => {
    if (!min) return m.first_observed_at;
    return m.first_observed_at < min ? m.first_observed_at : min;
  }, null);

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-5 px-4 py-5 sm:px-6">
      <Link
        href="/pt-intel"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        PT market
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-teal-900">
          {provider.organization_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {provider.parent_organization
            ? `${provider.parent_organization} · `
            : ""}
          {provider.taxonomy_description ?? "PT company"}
          {provider.npi ? ` · NPI ${provider.npi}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          {[
            provider.primary_address,
            provider.city,
            provider.state,
            provider.zip,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active facilities" value={current.length} />
        <Stat label="Qualified" value={qualified} />
        <Stat label="First observed" value={formatDate(firstObserved)} />
        <Stat
          label="Last verified"
          value={formatDate(provider.last_verified_at)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wake senior living facilities served</CardTitle>
        </CardHeader>
        <CardContent>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Wake senior living facilities served yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Facility</th>
                    <th className="px-3 py-2 font-medium">Units</th>
                    <th className="px-3 py-2 font-medium">Confidence</th>
                    <th className="px-3 py-2 font-medium">Last observed</th>
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
                        <div className="flex items-center gap-2">
                          {m.facility && (
                            <SizeBadge sizeClass={m.facility.size_class} />
                          )}
                          <Link
                            href={`/pt-intel/facilities/${m.facility_id}`}
                            className="font-medium hover:underline"
                          >
                            {m.facility?.name ?? "Facility"}
                          </Link>
                          {!m.is_current && (
                            <span className="text-xs text-muted-foreground">
                              (former)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {formatNumber(m.facility?.unit_count)}
                      </td>
                      <td className="px-3 py-2.5">
                        <MatchConfidenceBadge confidence={m.match_confidence} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-teal-900">
        {value}
      </div>
    </div>
  );
}
