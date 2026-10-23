"use client";

import { CalendarClock, Hash, Mail, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import type { SlackBlock, SlackPayload } from "@/lib/notifications/slackDispatcher";
import type { Channel, DeliveryResult, DispatchLog } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

interface ApiResponse {
  log: DispatchLog;
  slack: SlackPayload;
  email: { subject: string; html: string; text: string };
  audience: string[];
  config: { slack: boolean; email: boolean; manualSend: boolean };
  error?: string;
}

const STATUS_TONE: Record<DeliveryResult["status"], Tone> = { sent: "emerald", skipped: "amber", failed: "rose", preview: "neutral" };

/** Next Tuesday or Thursday at 07:00 IST (01:30 UTC) */
function nextRun(now = new Date()): Date {
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, 1, 30));
    if ((d.getUTCDay() === 2 || d.getUTCDay() === 4) && d > now) return d;
  }
  return now;
}

export function DispatchCenter() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"slack" | "email">("slack");
  const [confirm, setConfirm] = useState<Channel[] | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<DeliveryResult[]>([]);

  const call = useCallback(async (body: { send: boolean; channels?: Channel[] }) => {
    const res = await fetch("/api/dispatch/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json()) as ApiResponse;
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await call({ send: false }));
    } catch (e) {
      toast.warning("Could not build digest", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const send = async (channels: Channel[]) => {
    setSending(true);
    try {
      const json = await call({ send: true, channels });
      setHistory((h) => [...json.log.delivery, ...h].slice(0, 10));
      const bad = json.log.delivery.filter((d) => d.status !== "sent");
      if (bad.length) toast.warning("Dispatch finished with issues", bad.map((d) => `${d.channel}: ${d.detail}`).join(" · "));
      else toast.success("Digest dispatched", `Sent to ${channels.join(" and ")}.`);
    } catch (e) {
      toast.warning("Dispatch failed", e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
      setConfirm(null);
    }
  };

  const next = useMemo(() => nextRun(), []);
  const canSend = data?.config.manualSend ?? false;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Digest &amp; Dispatch Center</h1>
          <p className="text-sm text-zinc-500">Automated Slack and email digest. Preview exactly what goes out, or send a test now.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh preview
          </Button>
          <Button variant="primary" disabled={!canSend || sending || !data} onClick={() => setConfirm(["slack", "email"])}>
            <Send className="h-4 w-4" />
            Send test digest
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="flex items-start gap-3 p-4">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Schedule</p>
            <p className="text-sm font-semibold text-zinc-100">Tuesday and Thursday, 07:00 IST</p>
            <p className="text-xs text-zinc-500">
              Next run:{" "}
              {next.toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST · cron <span className="font-mono">30 1 * * 2,4</span> UTC
            </p>
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-4">
          <Hash className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Slack · {data?.slack.channel ?? "#ops-procurement"}</p>
            <p className="mt-0.5">
              <Badge tone={data?.config.slack ? "emerald" : "amber"} dot>
                {data?.config.slack ? "Connected" : "Not configured"}
              </Badge>
            </p>
            {!data?.config.slack && <p className="mt-1 text-xs text-zinc-500">Set SLACK_BOT_TOKEN or SLACK_WEBHOOK_URL</p>}
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-4">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Email recipients</p>
            <p className="mt-0.5">
              <Badge tone={data?.config.email ? "emerald" : "amber"} dot>
                {data?.config.email ? "Configured" : "Not configured"}
              </Badge>
            </p>
            <p className="mt-1 text-xs text-zinc-500">{data?.audience.join(" · ")}</p>
          </div>
        </Card>
      </div>

      {data && !data.config.manualSend && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Test sends are switched off on this deployment. Set ALLOW_MANUAL_DISPATCH=true to enable them. Previews still work.
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-1">
          <Tabs
            tabs={[
              { id: "slack", label: "Slack preview", icon: <Hash className="h-3.5 w-3.5" /> },
              { id: "email", label: "Email preview", icon: <Mail className="h-3.5 w-3.5" /> },
            ]}
            value={tab}
            onChange={setTab}
            className="border-b-0"
          />
          <Button size="sm" disabled={!canSend || sending || !data} onClick={() => setConfirm([tab])}>
            <Send className="h-3.5 w-3.5" />
            Send {tab === "slack" ? "Slack" : "email"} only
          </Button>
        </div>
        <div className="border-t border-zinc-800 p-4">
          {!data ? (
            <div className="h-72 animate-pulse rounded-lg bg-zinc-900/60" />
          ) : tab === "slack" ? (
            <SlackPreview payload={data.slack} />
          ) : (
            <div>
              <p className="mb-2 text-xs text-zinc-500">
                Subject: <span className="text-zinc-200">{data.email.subject}</span>
              </p>
              <iframe title="Email preview" srcDoc={data.email.html} sandbox="" className="h-[720px] w-full rounded-lg border border-zinc-800 bg-white" />
            </div>
          )}
        </div>
      </Card>

      {history.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-medium text-zinc-100">Delivery log (this session)</h2>
          <ul className="divide-y divide-zinc-800/70">
            {history.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <Badge tone={STATUS_TONE[h.status]} dot>
                  {h.status}
                </Badge>
                <span className="w-14 text-zinc-300">{h.channel}</span>
                <span className="min-w-0 flex-1 text-zinc-400">{h.detail}</span>
                <span className="text-xs text-zinc-600">{new Date(h.at).toLocaleTimeString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => !sending && setConfirm(null)}
        title="Send this digest now?"
        description="This delivers a real message outside the app."
        className="max-w-lg"
        footer={
          <>
            <Button variant="ghost" disabled={sending} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={sending} onClick={() => confirm && send(confirm)}>
              <Send className="h-4 w-4" />
              {sending ? "Sending…" : "Send now"}
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm text-zinc-300">
          {confirm?.includes("slack") && (
            <li>
              Slack: posts to <span className="font-medium text-zinc-100">{data?.slack.channel}</span> {data?.config.slack ? "" : "(not configured, will be skipped)"}
            </li>
          )}
          {confirm?.includes("email") && (
            <li>
              Email: sends to <span className="font-medium text-zinc-100">{data?.audience.join(", ")}</span> {data?.config.email ? "" : "(not configured, will be skipped)"}
            </li>
          )}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">Marked as a manual test run. The scheduled Tuesday and Thursday runs are unaffected.</p>
      </Dialog>
    </div>
  );
}

/** Slack mrkdwn subset: *bold*, `code`, newlines */
function Mrkdwn({ text }: { text: string }) {
  const decoded = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return (
    <>
      {decoded.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(/(\*[^*]+\*|`[^`]+`)/g).map((part, j) =>
            part.startsWith("*") && part.endsWith("*") ? (
              <strong key={j} className="font-semibold text-zinc-50">
                {part.slice(1, -1)}
              </strong>
            ) : part.startsWith("`") && part.endsWith("`") ? (
              <code key={j} className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[12px] text-rose-300">
                {part.slice(1, -1)}
              </code>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            )
          )}
        </Fragment>
      ))}
    </>
  );
}

type TextObj = { text: string };

function SlackPreview({ payload }: { payload: SlackPayload }) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">F</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-zinc-100">
            Freshroots OpsHub <span className="ml-1 rounded bg-zinc-800 px-1 py-0.5 text-[10px] font-medium text-zinc-400">APP</span>
            <span className="ml-2 text-xs font-normal text-zinc-500">07:00 · {payload.channel}</span>
          </p>
          <div className="mt-2 space-y-2.5 text-[14px] leading-snug text-zinc-300">
            {payload.blocks.map((b, i) => (
              <SlackBlockView key={i} block={b} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlackBlockView({ block }: { block: SlackBlock }) {
  switch (block.type) {
    case "header":
      return <p className="text-lg font-bold leading-tight text-zinc-50">{(block.text as TextObj).text}</p>;
    case "divider":
      return <hr className="border-zinc-800" />;
    case "context":
      return (
        <p className="text-xs text-zinc-500">
          {(block.elements as TextObj[]).map((e, i) => (
            <Mrkdwn key={i} text={e.text} />
          ))}
        </p>
      );
    case "section": {
      const fields = block.fields as TextObj[] | undefined;
      if (fields)
        return (
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {fields.map((f, i) => (
              <p key={i}>
                <Mrkdwn text={f.text} />
              </p>
            ))}
          </div>
        );
      return (
        <p>
          <Mrkdwn text={(block.text as TextObj).text} />
        </p>
      );
    }
    case "actions":
      return (
        <div className="flex gap-2">
          {(block.elements as { text: TextObj; url: string }[]).map((el, i) => (
            <a key={i} href={el.url} target="_blank" rel="noreferrer" className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">
              {el.text.text}
            </a>
          ))}
        </div>
      );
    default:
      return null;
  }
}
