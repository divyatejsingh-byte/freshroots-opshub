import { formatInrCompact } from "../utils";
import type { DeliveryResult, Digest } from "./types";

export interface Recipient {
  name: string;
  email: string;
}

export interface EmailMessage {
  subject: string;
  html: string;
  text: string;
}

/** DIGEST_RECIPIENTS="Raghav Kulkarni <raghav@x.com>, Deepa <deepa@x.com>" */
export function parseRecipients(raw = process.env.DIGEST_RECIPIENTS ?? ""): Recipient[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.*?)\s*<([^>]+)>$/);
      return m ? { name: m[1].trim() || m[2], email: m[2].trim() } : { name: part, email: part };
    })
    .filter((r) => /^[^@\s]+@[^@\s]+$/.test(r.email));
}

export const AUDIENCE = ["Raghav Kulkarni (Demand Planner)", "Deepa (Procurement)", "CEO", "Procurement Head"];

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && parseRecipients().length);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cover = (w: number) => (Number.isFinite(w) ? `${w.toFixed(1)} wks` : "n/a");

function kpiCell(label: string, value: string, sub: string, color: string): string {
  return `<td width="50%" style="padding:6px;vertical-align:top">
    <div style="border:1px solid #e4e4e7;border-radius:10px;padding:14px 16px;background:#ffffff">
      <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#71717a">${label}</div>
      <div style="font-size:26px;font-weight:700;color:${color};margin:4px 0 2px">${value}</div>
      <div style="font-size:12px;color:#52525b">${sub}</div>
    </div></td>`;
}

export function buildEmail(d: Digest): EmailMessage {
  const subject = `Freshroots Demand & Procurement Digest · ${d.dateLabel} · ${d.critical.count} critical, ${d.readyForApproval.count} ready to order`;

  const festival = d.festival.active
    ? `<div style="margin:6px;padding:12px 16px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:13px">
         🎪 <strong>${esc(d.festival.name)} uplift active:</strong> +${d.festival.upliftPct}% applied to ${esc(d.festival.segments.join(", "))}. Recommended orders already include the buffer.
       </div>`
    : "";

  const rows = d.topCritical
    .map(
      (s) => `<tr>
        <td style="padding:10px 12px;border-top:1px solid #e4e4e7;font-size:13px"><strong>${esc(s.name)}</strong><br><span style="color:#71717a;font-size:11px">${esc(s.id)} · ${esc(s.supplier)}</span></td>
        <td style="padding:10px 12px;border-top:1px solid #e4e4e7;font-size:13px;color:#be123c;white-space:nowrap">${cover(s.coverWeeks)}</td>
        <td style="padding:10px 12px;border-top:1px solid #e4e4e7;font-size:13px;text-align:right;white-space:nowrap">${s.recommendedQty.toLocaleString("en-IN")} units<br><span style="color:#71717a;font-size:11px">${formatInrCompact(s.orderValue)}</span></td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%">
  <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);background-color:#4f46e5;border-radius:12px 12px 0 0;padding:24px 28px;color:#ffffff">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Freshroots OpsHub · ${esc(d.runLabel)} run · 07:00 IST</div>
    <div style="font-size:22px;font-weight:700;margin-top:6px">Demand &amp; Procurement Digest</div>
    <div style="font-size:13px;opacity:.9;margin-top:4px">${esc(d.dateLabel)} · ${d.totalSkus} active SKUs</div>
  </td></tr>
  <tr><td style="background:#fafafa;padding:14px 22px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${kpiCell("🔴 Critical stockouts", String(d.critical.count), `Est. lost sales ${formatInrCompact(d.critical.lostSales)}`, "#be123c")}${kpiCell("🟡 Overstock warnings", String(d.overstock.count), `Tied-up capital ${formatInrCompact(d.overstock.tiedUpCapital)}`, "#b45309")}</tr>
      <tr>${kpiCell("🟢 Ready for batch approval", String(d.readyForApproval.count), `Rule-passed · ${formatInrCompact(d.readyForApproval.orderValue)} order value`, "#047857")}${kpiCell("💳 Pending payables", formatInrCompact(d.payables.pendingApproval), `${d.payables.pendingCount} POs awaiting approval` + (d.payables.overdueCount ? ` · ${formatInrCompact(d.payables.overdue)} overdue` : ""), "#4338ca")}</tr>
    </table>
    ${festival}
  </td></tr>
  <tr><td style="background:#fafafa;padding:0 28px 8px">
    <div style="font-size:14px;font-weight:700;margin:8px 0 8px">Needs Raghav's immediate action</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;border-collapse:separate">
      <tr><td style="padding:8px 12px;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.05em">SKU</td><td style="padding:8px 12px;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.05em">Cover</td><td style="padding:8px 12px;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.05em;text-align:right">Reorder</td></tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td style="background:#fafafa;padding:20px 28px 28px;border-radius:0 0 12px 12px" align="center">
    <a href="${esc(d.workbenchUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px">Open Raghav's Workbench</a>
    <div style="font-size:11px;color:#71717a;margin-top:16px">Sent automatically every Tuesday and Thursday at 07:00 IST by Freshroots OpsHub.<br>Thresholds: standard stockout &lt;6 wks / overstock &gt;14 wks; perishable &lt;3 wks / &gt;4 wks.</div>
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Freshroots Demand & Procurement Digest (${d.runLabel} run) · ${d.dateLabel}`,
    "",
    `Critical stockouts: ${d.critical.count} (est. lost sales ${formatInrCompact(d.critical.lostSales)})`,
    `Overstock warnings: ${d.overstock.count} (tied-up capital ${formatInrCompact(d.overstock.tiedUpCapital)})`,
    `Ready for batch approval: ${d.readyForApproval.count} (${formatInrCompact(d.readyForApproval.orderValue)})`,
    d.festival.active ? `Festival uplift: ${d.festival.name} +${d.festival.upliftPct}% on ${d.festival.segments.join(", ")}` : "Festival uplift: none active",
    `Pending payables: ${formatInrCompact(d.payables.pendingApproval)} (${d.payables.pendingCount} POs)`,
    "",
    "Top critical SKUs:",
    ...d.topCritical.map((s, i) => `${i + 1}. ${s.name} (${s.id}): ${cover(s.coverWeeks)} cover, reorder ${s.recommendedQty} units, ${s.supplier}`),
    "",
    `Open the workbench: ${d.workbenchUrl}`,
  ].join("\n");

  return { subject, html, text };
}

/** Sends through the Resend HTTP API; no SDK needed */
export async function sendEmail(d: Digest): Promise<DeliveryResult> {
  const at = new Date().toISOString();
  const recipients = parseRecipients();
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !recipients.length) {
    return { channel: "email", status: "skipped", detail: "Not configured: set RESEND_API_KEY, EMAIL_FROM and DIGEST_RECIPIENTS", at };
  }
  const msg = buildEmail(d);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: recipients.map((r) => (r.name === r.email ? r.email : `${r.name} <${r.email}>`)),
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) return { channel: "email", status: "failed", detail: `Resend returned ${res.status}: ${(await res.text()).slice(0, 160)}`, at };
    return { channel: "email", status: "sent", detail: `Sent to ${recipients.length} recipients`, at };
  } catch (err) {
    return { channel: "email", status: "failed", detail: err instanceof Error ? err.message : "Unknown error", at };
  }
}
