import { buildDigest } from "./digest";
import { emailConfigured, sendEmail } from "./emailDispatcher";
import { sendSlack, slackConfigured } from "./slackDispatcher";
import type { Channel, DeliveryResult, DispatchLog } from "./types";

export interface DispatchOptions {
  trigger: DispatchLog["trigger"];
  /** false builds the digest and payloads but delivers nothing */
  send: boolean;
  channels?: Channel[];
}

export async function runDispatch({ trigger, send, channels = ["slack", "email"] }: DispatchOptions): Promise<DispatchLog> {
  const summary = buildDigest();
  const at = new Date().toISOString();

  const jobs: Promise<DeliveryResult>[] = channels.map((channel) => {
    if (!send) return Promise.resolve<DeliveryResult>({ channel, status: "preview", detail: "Preview only, nothing was sent", at });
    return channel === "slack" ? sendSlack(summary) : sendEmail(summary);
  });
  const delivery = await Promise.all(jobs);

  return { timestamp: at, trigger, mode: send ? "send" : "preview", delivery, summary };
}

export function channelConfig() {
  return { slack: slackConfigured(), email: emailConfigured() };
}

/** Manual sends are open in development; in production they must be switched on explicitly */
export function manualSendAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_MANUAL_DISPATCH === "true";
}
