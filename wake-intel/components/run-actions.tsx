"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

// Calls the deployed edge functions. No-auth tool: the anon key is itself a valid JWT
// for the functions' verify_jwt; the functions use the service role internally.
function useEdgeFunction() {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  async function call(fn: string, body: Record<string, unknown>) {
    setPending(fn);
    setMessage(null);
    try {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
      const res = await fetch(`${base}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anon}`,
          apikey: anon,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        setMessage(`Failed (${res.status}): ${text.slice(0, 140)}`);
      } else {
        setMessage("Done. Refreshing…");
        router.refresh();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPending(null);
    }
  }

  return { pending, message, call };
}

export function RunActions() {
  const { pending, message, call } = useEdgeFunction();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending !== null}
        onClick={() => call("run-monthly-refresh", { run_type: "full_refresh" })}
      >
        <RefreshCw
          className={
            "mr-1.5 h-4 w-4" +
            (pending === "run-monthly-refresh" ? " animate-spin" : "")
          }
        />
        Run monthly update
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending !== null}
        onClick={() => call("generate-report", {})}
      >
        <FileText className="mr-1.5 h-4 w-4" />
        Generate report
      </Button>
      {message && (
        <span className="text-xs text-muted-foreground">{message}</span>
      )}
    </div>
  );
}
