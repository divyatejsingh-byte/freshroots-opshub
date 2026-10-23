import { NextResponse } from "next/server";
import { loadServerDataset } from "@/lib/data/supabase";
import { zohoConfigured, zohoMissingEnv } from "@/lib/zoho/client";
import { buildSnapshot } from "@/lib/zoho/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reads Zoho and returns what it says about our SKUs. The browser decides which values to apply. */
export async function POST() {
  if (!zohoConfigured()) return NextResponse.json({ error: `Zoho is not configured. Missing: ${zohoMissingEnv().join(", ")}` }, { status: 503 });
  try {
    const { dataset } = await loadServerDataset();
    return NextResponse.json(await buildSnapshot(dataset.raws.map((r) => r.id)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Zoho sync failed" }, { status: 502 });
  }
}
