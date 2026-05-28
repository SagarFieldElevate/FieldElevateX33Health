import { Database, Lock, Workflow } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/domain";
import { getLastSyncAt } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const lastSync = await getLastSyncAt();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-5 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            This is an internal, no-auth tool — anyone with the link has full
            read/write access. Keep the URL private and don&apos;t expose it
            publicly.
          </p>
          <p>
            Server-side reads and writes use the Supabase service role and run
            only on the server; the key is never sent to the browser.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            Data sources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Source of truth</span>
            <span className="font-medium">Supabase (fe33_ schema)</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Last refresh</span>
            <span className="font-medium">
              {lastSync ? formatDateTime(lastSync) : "Never"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-muted-foreground" />
            Integrations
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Monthly refresh and report generation run via Supabase Edge
          Functions. Trigger them manually from the Reports page.
        </CardContent>
      </Card>
    </div>
  );
}
