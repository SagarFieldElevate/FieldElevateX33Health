import Link from "next/link";
import {
  ExternalLink,
  Building2,
  Ruler,
  BedDouble,
  Activity,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  SIZE_CLASS_LABEL,
  formatCents,
  formatDate,
  formatNumber,
} from "@/lib/domain";
import { SizeBadge } from "@/components/size-badge";
import { ContactCard } from "@/components/contact-card";
import { CallNotesTimeline } from "@/components/call-notes-timeline";
import { AIPipelineProgress } from "@/components/ai-pipeline-badge";
import { CallNoteForm } from "@/components/call-note-form";
import type { CallNote, Contact, Facility } from "@/lib/types";

export function FacilityDetailPanel({
  facility,
  contacts,
  notes,
  ptProviderCount = 0,
  className,
}: {
  facility: Facility | null;
  contacts: Contact[];
  notes: CallNote[];
  ptProviderCount?: number;
  className?: string;
}) {
  if (!facility) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        Select a facility to see its profile, contacts, and call history.
      </div>
    );
  }

  const primary = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;

  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">
              {facility.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {[facility.city, facility.state].filter(Boolean).join(", ") ||
                "Wake County, NC"}
              {facility.operator ? ` · ${facility.operator}` : ""}
            </p>
          </div>
          <Link
            href={`/facility/${facility.id}`}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Full profile
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Size + evidence */}
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">Size</h3>
          <SizeBadge
            sizeClass={facility.size_class}
            unitCount={facility.unit_count}
          />
        </div>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <Metric
            icon={Building2}
            label="Units"
            value={formatNumber(facility.unit_count)}
          />
          <Metric
            icon={BedDouble}
            label="Beds"
            value={formatNumber(facility.licensed_beds)}
          />
          <Metric
            icon={Ruler}
            label="Sq ft"
            value={formatNumber(facility.building_sqft)}
          />
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          {SIZE_CLASS_LABEL[facility.size_class]} · confidence{" "}
          {facility.size_confidence}
          {facility.estimated_units_low != null &&
            facility.estimated_units_high != null &&
            ` · est. ${facility.estimated_units_low}–${facility.estimated_units_high} units`}
        </p>
        {facility.property_record_url && (
          <a
            href={facility.property_record_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
          >
            Property record <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </section>

      {/* Primary contact */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Primary contact</h3>
        <ContactCard contact={primary} />
      </section>

      {/* AI pipeline + deal */}
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">AI pipeline</h3>
          <span className="text-sm font-semibold tabular-nums">
            {formatCents(facility.ai_estimated_deal_size_cents)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ACV
            </span>
          </span>
        </div>
        <AIPipelineProgress status={facility.ai_outreach_status} />
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div>Last contact: {formatDate(facility.ai_last_contact_at)}</div>
          {facility.ai_current_software && (
            <div>Current software: {facility.ai_current_software}</div>
          )}
          {facility.ai_pain_points && (
            <div>Pain points: {facility.ai_pain_points}</div>
          )}
        </div>
      </section>

      {/* PT — de-emphasized */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        {ptProviderCount > 0
          ? `${ptProviderCount} PT provider${ptProviderCount > 1 ? "s" : ""} on record`
          : "No PT provider on record"}
        <Link
          href={`/pt-intel/facilities/${facility.id}`}
          className="hover:underline"
        >
          (PT view)
        </Link>
      </div>

      {/* Call notes */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Call notes</h3>
          <CallNoteForm facilityId={facility.id} contacts={contacts} />
        </div>
        <CallNotesTimeline notes={notes} contacts={contacts} />
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
