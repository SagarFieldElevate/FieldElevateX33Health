import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Activity } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SizeBadge } from "@/components/size-badge";
import { ContactCard } from "@/components/contact-card";
import { CallNotesTimeline } from "@/components/call-notes-timeline";
import { CallNoteForm } from "@/components/call-note-form";
import { AIPipelineProgress } from "@/components/ai-pipeline-badge";
import { MatchConfidenceBadge } from "@/components/pt-provider-table";
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/domain";
import {
  getCallNotes,
  getContacts,
  getFacility,
  getFacilitySources,
  getMatchesForFacility,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function FacilityProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const facility = await getFacility(params.id);
  if (!facility) notFound();

  const [contacts, notes, sources, matches] = await Promise.all([
    getContacts(params.id),
    getCallNotes(params.id),
    getFacilitySources(params.id),
    getMatchesForFacility(params.id),
  ]);

  const primary = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
  const others = contacts.filter((c) => c.id !== primary?.id);

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 py-5 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Pipeline
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {facility.name}
            </h1>
            <SizeBadge
              sizeClass={facility.size_class}
              unitCount={facility.unit_count}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[facility.address, facility.city, facility.state, facility.zip]
              .filter(Boolean)
              .join(", ") || "Wake County, NC"}
            {facility.operator ? ` · ${facility.operator}` : ""}
            {facility.facility_type ? ` · ${facility.facility_type}` : ""}
          </p>
        </div>
        <Link
          href={`/pt-intel/facilities/${facility.id}`}
          className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline"
        >
          <Activity className="h-4 w-4" />
          PT view
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left two-thirds */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Call history</CardTitle>
              <CallNoteForm facilityId={facility.id} contacts={contacts} />
            </CardHeader>
            <CardContent>
              <CallNotesTimeline notes={notes} contacts={contacts} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Size signals &amp; evidence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Field label="Units" value={formatNumber(facility.unit_count)} />
                <Field
                  label="Beds"
                  value={formatNumber(facility.licensed_beds)}
                />
                <Field
                  label="Building sqft"
                  value={formatNumber(facility.building_sqft)}
                />
                <Field
                  label="Year built"
                  value={facility.year_built?.toString() ?? "—"}
                />
                <Field
                  label="Acreage"
                  value={facility.acreage?.toString() ?? "—"}
                />
                <Field
                  label="Assessed value"
                  value={formatCents(
                    facility.assessed_value != null
                      ? facility.assessed_value * 100
                      : null,
                  )}
                />
                <Field
                  label="Confidence"
                  value={facility.size_confidence}
                />
                <Field
                  label="Ownership"
                  value={facility.ownership_type ?? "—"}
                />
              </dl>

              {sources.length > 0 ? (
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Source</th>
                        <th className="px-3 py-2 font-medium">Confidence</th>
                        <th className="px-3 py-2 font-medium">Fetched</th>
                        <th className="px-3 py-2 font-medium">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="px-3 py-2">{s.source_type}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {s.confidence ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {formatDate(s.fetched_at)}
                          </td>
                          <td className="px-3 py-2">
                            {s.source_url ? (
                              <a
                                href={s.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sky-600 hover:underline"
                              >
                                View <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No evidence sources recorded yet.
                </p>
              )}
            </CardContent>
          </Card>

          {/* PT — de-emphasized */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="h-4 w-4" />
                PT providers (reference)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No PT providers on record.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {matches.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        {m.provider?.organization_name ??
                          m.named_provider ??
                          "Unknown provider"}
                        {m.provider?.parent_organization && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {m.provider.parent_organization}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MatchConfidenceBadge confidence={m.match_confidence} />
                        {formatDate(m.last_observed_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right third */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>AI pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <AIPipelineProgress status={facility.ai_outreach_status} />
              <dl className="space-y-1.5 text-sm">
                <Row
                  label="Deal size (ACV)"
                  value={formatCents(facility.ai_estimated_deal_size_cents)}
                />
                <Row
                  label="Priority"
                  value={facility.ai_priority}
                />
                <Row
                  label="Last contact"
                  value={formatDate(facility.ai_last_contact_at)}
                />
                <Row
                  label="Status changed"
                  value={formatDate(facility.ai_outreach_status_changed_at)}
                />
                <Row
                  label="Current software"
                  value={facility.ai_current_software ?? "—"}
                />
              </dl>
              {facility.ai_pain_points && (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Pain points
                  </div>
                  {facility.ai_pain_points}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Contacts</h2>
              <span className="text-xs text-muted-foreground">
                {contacts.length}
              </span>
            </div>
            <ContactCard contact={primary} />
            {others.map((c) => (
              <ContactCard key={c.id} contact={c} />
            ))}
          </div>

          {facility.internal_notes && (
            <Card>
              <CardHeader>
                <CardTitle>Internal notes</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
                {facility.internal_notes}
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            Created {formatDateTime(facility.created_at)} · Updated{" "}
            {formatDateTime(facility.updated_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
