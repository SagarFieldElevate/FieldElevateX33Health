import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

// supabase-js v2 expects a global WebSocket (Node 20 has none). Guarded polyfill.
if (!globalThis.WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).WebSocket = ws;
}

// NO-AUTH INTERNAL TOOL: login is disabled (direct access), so all server-side reads
// and writes use the service-role key, which bypasses RLS. This client is created ONLY
// in Server Components, Server Actions, and Route Handlers — it is NEVER shipped to the
// browser, so the key is not exposed. (Kept async so existing `await createClient()`
// call sites are unchanged.)
export async function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
