import {
  Phone,
  Mail,
  Voicemail,
  Users,
  Presentation,
  StickyNote,
  CalendarClock,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  CALL_OUTCOME_LABEL,
  INTERACTION_TYPE_LABEL,
  formatDateTime,
  formatDate,
} from "@/lib/domain";
import type { CallNote, Contact, InteractionType } from "@/lib/types";

function typeIcon(type: InteractionType) {
  switch (type) {
    case "call_inbound":
    case "call_outbound":
      return Phone;
    case "voicemail":
      return Voicemail;
    case "email_inbound":
    case "email_outbound":
      return Mail;
    case "meeting":
      return Users;
    case "demo":
      return Presentation;
    case "note":
    default:
      return StickyNote;
  }
}

export function CallNotesTimeline({
  notes,
  contacts = [],
  className,
}: {
  notes: CallNote[];
  contacts?: Contact[];
  className?: string;
}) {
  if (notes.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground",
          className,
        )}
      >
        No interactions logged yet.
      </div>
    );
  }

  const contactName = (id: string | null) =>
    id ? contacts.find((c) => c.id === id)?.name : undefined;

  return (
    <ol className={cn("space-y-3", className)}>
      {notes.map((note) => {
        const Icon = typeIcon(note.interaction_type);
        const who = contactName(note.contact_id);
        return (
          <li key={note.id} className="relative flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-card">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {INTERACTION_TYPE_LABEL[note.interaction_type]}
                </span>
                {note.outcome && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5">
                    {CALL_OUTCOME_LABEL[note.outcome]}
                  </span>
                )}
                <span>· {formatDateTime(note.interaction_date)}</span>
                {who && <span>· {who}</span>}
                {note.duration_minutes != null && (
                  <span>· {note.duration_minutes}m</span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {note.summary}
              </p>
              {note.ai_solutions_pitched &&
                note.ai_solutions_pitched.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {note.ai_solutions_pitched.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700"
                      >
                        {s.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
              {note.follow_up_at && (
                <div
                  className={cn(
                    "mt-1.5 inline-flex items-center gap-1 text-xs",
                    note.follow_up_done
                      ? "text-muted-foreground line-through"
                      : "text-amber-600",
                  )}
                >
                  <CalendarClock className="h-3 w-3" />
                  Follow-up {formatDate(note.follow_up_at)}
                  {note.follow_up_done && " (done)"}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
