import { NextResponse } from "next/server";
import { clearDecisions, loadServerDataset, saveDecisions, supabaseConfigured } from "@/lib/data/supabase";
import { generateSuppliers } from "@/lib/mockData";
import type { Decision } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The same sample-supplier seed the client store boots with, so SKU-to-vendor links match */
const SEED = 42;

/** Dataset plus saved planner decisions. Falls back to the bundled CSVs when Supabase is not configured or fails. */
export async function GET() {
  const { dataset, decisions, error } = await loadServerDataset(generateSuppliers(SEED));
  return NextResponse.json({ source: dataset.meta.source, skus: dataset.skus, distributors: dataset.distributors, meta: dataset.meta, decisions, error });
}

/** Saves planner decisions { [skuId]: Decision }. No-op without Supabase. */
export async function POST(request: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ saved: 0, skipped: "Supabase not configured" });
  const body = (await request.json().catch(() => null)) as { decisions?: Record<string, Decision> } | null;
  if (!body?.decisions || typeof body.decisions !== "object") return NextResponse.json({ error: "Expected { decisions }" }, { status: 400 });
  try {
    return NextResponse.json({ saved: await saveDecisions(body.decisions) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 502 });
  }
}

/** Clears saved decisions. No-op without Supabase. */
export async function DELETE() {
  if (!supabaseConfigured()) return NextResponse.json({ cleared: false });
  try {
    await clearDecisions();
    return NextResponse.json({ cleared: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Clear failed" }, { status: 502 });
  }
}
