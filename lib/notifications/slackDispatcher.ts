import { formatInrCompact } from "../utils";
import type { DeliveryResult, Digest } from "./types";

export type SlackBlock = Record<string, unknown>;

export interface SlackPayload {
  channel: string;
  text: string;
  blocks: SlackBlock[];
}

export const SLACK_CHANNEL = process.env.SLACK_CHANNEL ?? "#ops-procurement";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cover = (w: number) => (Number.isFinite(w) ? `${w.toFixed(1)}w` : "∞");

export function buildSlackPayload(d: Digest): SlackPayload {
  const title = `🚨 Freshroots Bi-Weekly Demand & Procurement Digest (${d.runLabel} Run)`;

  const festivalLine = d.festival.active
    ? `🎪 *Festival Uplift*\n${d.festival.name} +${d.festival.upliftPct}% applied to ${d.festival.segments.join(", ")}`
    : "🎪 *Festival Uplift*\nNo festival uplift active";

  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: title, emoji: true } },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `${d.dateLabel} · 07:00 IST · ${d.totalSkus} active SKUs · posted to ${SLACK_CHANNEL}` }],
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `🔴 *Critical Stockouts*\n*${d.critical.count}* SKUs · est. lost sales *${formatInrCompact(d.critical.lostSales)}*` },
        { type: "mrkdwn", text: `🟡 *Overstock Warnings*\n*${d.overstock.count}* SKUs · tied-up capital *${formatInrCompact(d.overstock.tiedUpCapital)}*` },
        { type: "mrkdwn", text: `🟢 *Ready to Order*\n*${d.readyForApproval.count}* rule-passed SKUs · ${formatInrCompact(d.readyForApproval.orderValue)}` },
        { type: "mrkdwn", text: festivalLine },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `💳 *Pending supplier payables:* *${formatInrCompact(d.payables.pendingApproval)}* across ${d.payables.pendingCount} POs awaiting approval` + (d.payables.overdueCount ? ` · ⚠️ ${formatInrCompact(d.payables.overdue)} overdue (${d.payables.overdueCount} POs)` : ""),
      },
    },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: "*Top 3 critical SKUs needing Raghav's immediate action*" } },
    ...d.topCritical.map((s, i) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${i + 1}. ${esc(s.name)}* \`${s.id}\`\n${cover(s.coverWeeks)} cover · ${Math.round(s.weeklyVelocity)}/wk · reorder *${s.recommendedQty.toLocaleString("en-IN")}* units (${formatInrCompact(s.orderValue)}) · ${esc(s.supplier)}`,
      },
    })),
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open Raghav's Workbench", emoji: true },
          style: "primary",
          url: d.workbenchUrl,
          action_id: "open_workbench",
        },
      ],
    },
  ];

  return { channel: SLACK_CHANNEL, text: `${title}: ${d.critical.count} critical, ${d.overstock.count} overstock, ${d.readyForApproval.count} ready to order`, blocks };
}

export function slackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN || process.env.SLACK_WEBHOOK_URL);
}

export async function sendSlack(d: Digest): Promise<DeliveryResult> {
  const at = new Date().toISOString();
  const payload = buildSlackPayload(d);
  try {
    if (process.env.SLACK_BOT_TOKEN) {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      return json.ok
        ? { channel: "slack", status: "sent", detail: `Posted to ${payload.channel}`, at }
        : { channel: "slack", status: "failed", detail: `Slack API error: ${json.error ?? res.status}`, at };
    }
    if (process.env.SLACK_WEBHOOK_URL) {
      // Incoming webhooks are bound to one channel and ignore the `channel` field
      const { text, blocks } = payload;
      const res = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, blocks }),
      });
      return res.ok
        ? { channel: "slack", status: "sent", detail: "Posted via incoming webhook", at }
        : { channel: "slack", status: "failed", detail: `Webhook returned ${res.status}`, at };
    }
    return { channel: "slack", status: "skipped", detail: "Not configured: set SLACK_BOT_TOKEN or SLACK_WEBHOOK_URL", at };
  } catch (err) {
    return { channel: "slack", status: "failed", detail: err instanceof Error ? err.message : "Unknown error", at };
  }
}
