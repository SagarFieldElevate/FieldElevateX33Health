"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AI_SOLUTION_OPTIONS,
  CALL_OUTCOME_LABEL,
  INTERACTION_TYPE_LABEL,
} from "@/lib/domain";
import { logCall, type LogCallInput } from "@/app/actions";
import type { CallOutcome, Contact, InteractionType } from "@/lib/types";

function localDatetimeValue(d = new Date()) {
  // yyyy-MM-ddThh:mm in local time for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function CallNoteForm({
  facilityId,
  contacts,
  triggerClassName,
  triggerLabel = "Log call",
  triggerSize = "sm",
}: {
  facilityId: string;
  contacts: Contact[];
  triggerClassName?: string;
  triggerLabel?: string;
  triggerSize?: "sm" | "default";
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const primary = contacts.find((c) => c.is_primary) ?? contacts[0];

  const [contactId, setContactId] = React.useState<string>(primary?.id ?? "");
  const [type, setType] = React.useState<InteractionType>("call_outbound");
  const [when, setWhen] = React.useState(localDatetimeValue());
  const [duration, setDuration] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [outcome, setOutcome] = React.useState<CallOutcome | "">("");
  const [solutions, setSolutions] = React.useState<string[]>([]);
  const [followUp, setFollowUp] = React.useState("");

  const reset = () => {
    setContactId(primary?.id ?? "");
    setType("call_outbound");
    setWhen(localDatetimeValue());
    setDuration("");
    setSummary("");
    setOutcome("");
    setSolutions([]);
    setFollowUp("");
    setError(null);
  };

  const toggleSolution = (value: string) =>
    setSolutions((cur) =>
      cur.includes(value)
        ? cur.filter((s) => s !== value)
        : [...cur, value],
    );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) {
      setError("Summary is required.");
      return;
    }
    setPending(true);
    setError(null);

    const payload: LogCallInput = {
      facility_id: facilityId,
      contact_id: contactId || null,
      interaction_type: type,
      interaction_date: new Date(when).toISOString(),
      duration_minutes: duration ? Number(duration) : null,
      summary: summary.trim(),
      outcome: outcome || null,
      ai_solutions_pitched: solutions,
      follow_up_at: followUp ? new Date(followUp).toISOString() : null,
    };

    const res = await logCall(payload);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    reset();
  }

  return (
    <>
      <Button
        size={triggerSize}
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-xl"
          onClose={() => setOpen(false)}
        >
          <DialogHeader>
            <DialogTitle>Log interaction</DialogTitle>
            <DialogDescription>
              Records a call note. Facility status and last-contact update
              automatically.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cn-contact">Contact</Label>
                <Select
                  id="cn-contact"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                >
                  <option value="">— No specific contact —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.title ? ` · ${c.title}` : ""}
                      {c.is_primary ? " (primary)" : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cn-type">Type</Label>
                <Select
                  id="cn-type"
                  value={type}
                  onChange={(e) =>
                    setType(e.target.value as InteractionType)
                  }
                >
                  {(
                    Object.keys(
                      INTERACTION_TYPE_LABEL,
                    ) as InteractionType[]
                  ).map((t) => (
                    <option key={t} value={t}>
                      {INTERACTION_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cn-when">When</Label>
                <Input
                  id="cn-when"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cn-duration">Duration (min)</Label>
                <Input
                  id="cn-duration"
                  type="number"
                  min={0}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="optional"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cn-summary">Summary</Label>
              <Textarea
                id="cn-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="What happened on this interaction?"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cn-outcome">Outcome</Label>
                <Select
                  id="cn-outcome"
                  value={outcome}
                  onChange={(e) =>
                    setOutcome(e.target.value as CallOutcome | "")
                  }
                >
                  <option value="">— None —</option>
                  {(
                    Object.keys(CALL_OUTCOME_LABEL) as CallOutcome[]
                  ).map((o) => (
                    <option key={o} value={o}>
                      {CALL_OUTCOME_LABEL[o]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cn-followup">Follow-up date</Label>
                <Input
                  id="cn-followup"
                  type="datetime-local"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>AI solutions pitched</Label>
              <div className="flex flex-wrap gap-1.5">
                {AI_SOLUTION_OPTIONS.map((opt) => {
                  const active = solutions.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleSolution(opt.value)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-sky-300 bg-sky-100 text-sky-700"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save note"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
