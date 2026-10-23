import { NextResponse } from "next/server";
import { runDispatch } from "@/lib/notifications/dispatch";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron entry point (Tue and Thu, 01:30 UTC = 07:00 IST).
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set on the project.
 * Without a secret the route only runs outside production, so local testing works.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 401 });
  }

  // ?dryRun=1 builds everything without delivering (handy when testing locally)
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const log = await runDispatch({ trigger: "cron", send: !dryRun });

  const failed = log.delivery.some((d) => d.status === "failed");
  return NextResponse.json(log, { status: failed ? 502 : 200 });
}
