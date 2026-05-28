import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// supabase-js v2 expects a global WebSocket (Node 20 has none). Guarded polyfill.
if (!globalThis.WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).WebSocket = ws;
}

// Service-role client for server-only tasks: seeding, Edge Functions, cron jobs.
// Bypasses RLS — NEVER import this into a Client Component or expose it to the browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
