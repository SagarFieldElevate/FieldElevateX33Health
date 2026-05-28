import { Mail, Phone, Link as LinkIcon, BadgeCheck, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { relativeDays } from "@/lib/domain";
import type { Contact } from "@/lib/types";

export function ContactCard({
  contact,
  className,
}: {
  contact: Contact | null | undefined;
  className?: string;
}) {
  if (!contact) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground",
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          No primary contact yet.
        </div>
      </div>
    );
  }

  const phone = contact.phone_direct || contact.phone;
  const stale =
    contact.verified_at &&
    Date.now() - new Date(contact.verified_at).getTime() >
      90 * 24 * 60 * 60 * 1000;

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 font-medium">
            {contact.name}
            {contact.is_primary && (
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
            )}
          </div>
          {contact.title && (
            <div className="text-sm text-muted-foreground">
              {contact.title}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex items-center gap-2 text-foreground hover:underline"
          >
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            {phone}
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-2 text-foreground hover:underline"
          >
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            {contact.email}
          </a>
        )}
        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-foreground hover:underline"
          >
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
            LinkedIn
          </a>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {contact.data_source && <span>src: {contact.data_source}</span>}
        {contact.verified_at && (
          <span className={cn(stale && "text-amber-600")}>
            verified {relativeDays(contact.verified_at)}
          </span>
        )}
      </div>
    </div>
  );
}
