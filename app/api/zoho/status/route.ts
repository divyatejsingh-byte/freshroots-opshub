import { NextResponse } from "next/server";
import { zohoConfigured, zohoDataCenter, zohoGet, zohoMissingEnv } from "@/lib/zoho/client";
import type { ZohoStatus } from "@/lib/zoho/types";

export const dynamic = "force-dynamic";

/** Whether Zoho is configured, and if so whether the credentials actually work */
export async function GET() {
  if (!zohoConfigured()) return NextResponse.json<ZohoStatus>({ configured: false, missing: [...zohoMissingEnv()] });
  const base = { configured: true, dataCenter: zohoDataCenter() };
  try {
    // The organization list needs the settings scope; if the token lacks it, an items call still proves the connection
    let orgName: string | undefined;
    try {
      const res = await zohoGet<{ organizations?: { organization_id: string; name: string }[] }>("/organizations", {}, false);
      const org = res.organizations?.find((o) => o.organization_id === process.env.ZOHO_ORG_ID);
      if (!org) return NextResponse.json<ZohoStatus>({ ...base, connected: false, error: "Signed in, but ZOHO_ORG_ID does not match any organization on this account." });
      orgName = org.name;
    } catch {
      await zohoGet("/items", { per_page: 1 });
    }
    return NextResponse.json<ZohoStatus>({ ...base, connected: true, orgName: orgName ?? `org ${process.env.ZOHO_ORG_ID}` });
  } catch (err) {
    return NextResponse.json<ZohoStatus>({ ...base, connected: false, error: err instanceof Error ? err.message : "Could not reach Zoho" });
  }
}
