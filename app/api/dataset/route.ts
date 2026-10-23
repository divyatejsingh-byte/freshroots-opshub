import { NextResponse } from "next/server";
import { loadServerDataset, saveDecisions, saveFixes, supabaseConfigured } from "@/lib/data/supabase";
import type { DataFix, Decision } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Raw dataset (nulls where the source has no value), saved decisions and saved data fixes. Falls back to the bundled CSVs. */
export async function GET() {
  const { dataset, decisions, fixes, error } = await loadServerDataset();
  return NextResponse.json({ source: dataset.meta.source, raws: dataset.raws, distributors: dataset.distributors, meta: dataset.meta, decisions, fixes, error });
}

/** Makes the saved decisions and fixes match { decisions, fixes }. No-op without Supabase. */
export async function POST(request: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ saved: 0, skipped: "Supabase not configured" });
  const body = (await request.json().catch(() => null)) as { decisions?: Record<string, Decision>; fixes?: Record<string, DataFix> } | null;
  if (!body || (!body.decisions && !body.fixes)) return NextResponse.json({ error: "Expected { decisions, fixes }" }, { status: 400 });
  try {
    const decisions = body.decisions ? await saveDecisions(body.decisions) : 0;
    const fixes = body.fixes ? await saveFixes(body.fixes) : 0;
    return NextResponse.json({ saved: { decisions, fixes } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 502 });
  }
}
