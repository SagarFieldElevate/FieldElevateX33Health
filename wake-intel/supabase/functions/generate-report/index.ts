// generate-report — Product A monthly AI-sales summary. Computes pipeline stats +
// priority outreach + follow-ups + PT market context, and (if configured) emails
// them via Resend.
// Product B (PT intel) has no report — it's a live dashboard.
//
// POST /functions/v1/generate-report   body: { monthly_run_id?: uuid }
//
// Email is only sent when BOTH RESEND_API_KEY and REPORT_TO are set, so this is
// safe to run before recipients are confirmed. PDF rendering is deferred (needs a
// headless-Chrome service); this sends an HTML summary.
import { adminClient } from "../_shared/supabase.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const QUALIFIED = ["confirmed_100_plus", "likely_100_plus"];

// Brand-ish palette (email-safe inline CSS only).
const BRAND = {
  ink: "#0f172a",
  sub: "#475569",
  line: "#e2e8f0",
  bg: "#f8fafc",
  accent: "#0d9488", // teal
  hot: "#dc2626",
  warm: "#d97706",
  cold: "#2563eb",
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : "—";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  await req.json().catch(() => ({})); // monthly_run_id is informational for now

  const supabase = adminClient();
  const now = new Date();
  const monthLabel = now.toISOString().slice(0, 7);
  const monthTitle = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // --- Pull data (fail-soft: treat any error as empty) ---
  const [facRes, ptRes] = await Promise.all([
    supabase
      .from("fe33_facilities")
      .select("id, name, city, unit_count, building_sqft, size_class, ai_priority, ai_outreach_status"),
    supabase
      .from("fe33_v_facility_pt_summary")
      .select("facility_id, size_class, pt_market_status"),
  ]);

  const f = facRes.data ?? [];
  const pt = ptRes.data ?? [];
  const count = (pred: (x: typeof f[number]) => boolean) => f.filter(pred).length;
  const isQualified = (sc: string | null) => QUALIFIED.includes(sc ?? "");

  const summary = {
    total_facilities: f.length,
    qualified_leads: count((x) => isQualified(x.size_class)),
    hot: count((x) => x.ai_priority === "hot"),
    warm: count((x) => x.ai_priority === "warm"),
    cold: count((x) => x.ai_priority === "cold"),
    dead: count((x) => x.ai_priority === "dead"),
    demos_scheduled: count((x) => x.ai_outreach_status === "demo_scheduled"),
  };

  // Top cold + qualified + not-yet-contacted facilities by unit_count desc.
  const priority_outreach = f
    .filter(
      (x) =>
        x.ai_priority === "cold" &&
        x.ai_outreach_status === "not_contacted" &&
        isQualified(x.size_class),
    )
    .sort((a, b) => (b.unit_count ?? 0) - (a.unit_count ?? 0))
    .slice(0, 5)
    .map((x) => ({
      name: x.name,
      city: x.city,
      units: x.unit_count,
      building_sqft: x.building_sqft,
    }));

  // Follow-ups due within 7 days.
  const weekOut = new Date(now.getTime() + 7 * 864e5).toISOString();
  const { data: followUpsData } = await supabase
    .from("fe33_call_notes")
    .select("facility_id, summary, follow_up_at")
    .eq("follow_up_done", false)
    .lte("follow_up_at", weekOut)
    .order("follow_up_at");
  const followUps = followUpsData ?? [];

  // PT market context: qualified facilities that are open-market for PT (company-based view).
  const ptQualifiedOpen = pt.filter(
    (x) => x.pt_market_status === "open_market" && isQualified(x.size_class),
  ).length;
  const ptOpenTotal = pt.filter((x) => x.pt_market_status === "open_market").length;

  const report = {
    report_month: monthLabel,
    generated_at: now.toISOString(),
    product: "field_elevate_ai",
    summary: { ...summary, follow_ups_due_this_week: followUps.length },
    pt_context: {
      qualified_open_market: ptQualifiedOpen,
      open_market_total: ptOpenTotal,
    },
    priority_outreach,
    follow_ups_due: followUps,
  };

  // --- HTML body (branded-ish, email-safe inline CSS) ---
  const stat = (label: string, value: number, color = BRAND.ink) => `
    <td align="center" style="padding:12px 8px;border:1px solid ${BRAND.line};border-radius:8px;background:#ffffff;">
      <div style="font-size:24px;line-height:1;font-weight:700;color:${color};font-family:Arial,Helvetica,sans-serif;">${fmt(value)}</div>
      <div style="margin-top:6px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${BRAND.sub};font-family:Arial,Helvetica,sans-serif;">${label}</div>
    </td>`;

  const statRow = (cells: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="6" width="100%" style="border-collapse:separate;"><tr>${cells}</tr></table>`;

  const outreachRows =
    priority_outreach.length === 0
      ? `<tr><td colspan="3" style="padding:12px;color:${BRAND.sub};font-family:Arial,Helvetica,sans-serif;font-size:13px;">No cold-qualified facilities awaiting first contact. 🎉</td></tr>`
      : priority_outreach
          .map(
            (p) => `
        <tr>
          <td style="padding:10px 12px;border-top:1px solid ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.ink};">${esc(p.name)}</td>
          <td style="padding:10px 12px;border-top:1px solid ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.sub};">${esc(p.city ?? "—")}</td>
          <td align="right" style="padding:10px 12px;border-top:1px solid ${BRAND.line};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.ink};white-space:nowrap;"><strong>${fmt(p.units)}</strong> units<br><span style="color:${BRAND.sub};font-size:11px;">${fmt(p.building_sqft)} sqft</span></td>
        </tr>`,
          )
          .join("");

  const followUpItems =
    followUps.length === 0
      ? `<p style="margin:0;color:${BRAND.sub};font-family:Arial,Helvetica,sans-serif;font-size:13px;">No follow-ups due in the next 7 days.</p>`
      : `<ul style="margin:0;padding-left:18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.ink};">${followUps
          .map((u) => {
            const when = u.follow_up_at
              ? new Date(u.follow_up_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "—";
            return `<li style="margin-bottom:6px;"><strong>${esc(when)}</strong> — ${esc(u.summary ?? "Follow up")}</li>`;
          })
          .join("")}</ul>`;

  const ptLine = ptQualifiedOpen > 0
    ? `<strong>${fmt(ptQualifiedOpen)}</strong> qualified ${ptQualifiedOpen === 1 ? "facility is" : "facilities are"} open-market for PT${
        ptOpenTotal > ptQualifiedOpen ? ` (${fmt(ptOpenTotal)} open-market overall)` : ""
      } — prime targets for a PT partnership pitch.`
    : `No qualified facilities are currently flagged open-market for PT.`;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;">Wake AI Sales — ${esc(monthTitle)}: ${fmt(summary.total_facilities)} facilities, ${fmt(summary.qualified_leads)} qualified.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BRAND.line};border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:${BRAND.ink};padding:24px 28px;">
          <div style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.7;">Wake Intel · Field Elevate</div>
          <div style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:22px;font-weight:700;margin-top:4px;">AI Sales Monthly Report</div>
          <div style="font-family:Arial,Helvetica,sans-serif;color:${BRAND.accent};font-size:14px;font-weight:600;margin-top:2px;">${esc(monthTitle)}</div>
        </td></tr>

        <!-- Stat grid -->
        <tr><td style="padding:20px 22px 4px;">
          ${statRow(stat("Total", summary.total_facilities) + stat("Qualified", summary.qualified_leads, BRAND.accent) + stat("Hot", summary.hot, BRAND.hot))}
          ${statRow(stat("Warm", summary.warm, BRAND.warm) + stat("Cold", summary.cold, BRAND.cold) + stat("Follow-ups due", followUps.length))}
        </td></tr>

        <!-- PT context -->
        <tr><td style="padding:8px 28px 4px;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.sub};border-left:3px solid ${BRAND.accent};padding-left:10px;">${ptLine}</p>
        </td></tr>

        <!-- Priority outreach -->
        <tr><td style="padding:18px 28px 4px;">
          <h3 style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${BRAND.ink};">Top priority outreach</h3>
          <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.sub};">Cold, qualified, not yet contacted — largest first.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${BRAND.line};border-radius:8px;border-collapse:separate;overflow:hidden;">
            <tr style="background:${BRAND.bg};">
              <td style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${BRAND.sub};">Facility</td>
              <td style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${BRAND.sub};">City</td>
              <td align="right" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${BRAND.sub};">Size</td>
            </tr>
            ${outreachRows}
          </table>
        </td></tr>

        <!-- Follow-ups -->
        <tr><td style="padding:18px 28px 24px;">
          <h3 style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${BRAND.ink};">Follow-ups due this week</h3>
          ${followUpItems}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:${BRAND.bg};border-top:1px solid ${BRAND.line};padding:14px 28px;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${BRAND.sub};">Generated ${esc(now.toISOString().slice(0, 10))} · Wake Intel automated report · Field Elevate</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Send only when fully configured (keeps this safe pre-launch).
  const key = Deno.env.get("RESEND_API_KEY");
  const to = (Deno.env.get("REPORT_TO") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const cc = (Deno.env.get("REPORT_CC") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let emailed = false;

  if (key && to.length) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("REPORT_FROM") ?? "Field Elevate Intel <intel@fieldelevate.com>",
        to,
        cc,
        subject: `Wake AI Sales — ${monthTitle} update`,
        html,
      }),
    }).catch(() => null);
    emailed = res?.ok ?? false;
  }

  return json({ status: "ok", emailed, report, html });
});
