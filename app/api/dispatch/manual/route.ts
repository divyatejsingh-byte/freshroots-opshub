import { NextResponse } from "next/server";
import { channelConfig, manualSendAllowed, runDispatch } from "@/lib/notifications/dispatch";
import { AUDIENCE, buildEmail } from "@/lib/notifications/emailDispatcher";
import { buildSlackPayload } from "@/lib/notifications/slackDispatcher";
import type { Channel } from "@/lib/notifications/types";

export const dynamic = "force-dynamic";

/**
 * Backs the Dispatch Center UI.
 * { send: false } (default) returns the digest plus the exact Slack and email payloads for preview.
 * { send: true, channels } delivers for real and is gated by manualSendAllowed().
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { send?: boolean; channels?: Channel[] };
  const send = body.send === true;
  const channels = (body.channels ?? ["slack", "email"]).filter((c): c is Channel => c === "slack" || c === "email");

  if (send && !manualSendAllowed()) {
    return NextResponse.json({ error: "Manual sends are disabled in production. Set ALLOW_MANUAL_DISPATCH=true to enable." }, { status: 403 });
  }

  const log = await runDispatch({ trigger: "manual", send, channels });
  return NextResponse.json({
    log,
    slack: buildSlackPayload(log.summary),
    email: buildEmail(log.summary),
    audience: AUDIENCE,
    config: { ...channelConfig(), manualSend: manualSendAllowed() },
  });
}
