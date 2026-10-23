import "server-only";
import type { DataFix, Decision, FixField } from "../types";
import { buildDataset, loadDataset, type Dataset } from "./load";
import { fixKey } from "./quality";

/**
 * Server-side Supabase access over PostgREST (no SDK). Uses the secret/service key,
 * which must never reach the browser: only call this from route handlers.
 */

const url = () => (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = () => process.env.SUPABASE_SECRET_KEY ?? "";

export function supabaseConfigured(): boolean {
  return Boolean(url() && key());
}

function headers(extra: Record<string, string> = {}) {
  // New sb_secret_ keys are not JWTs and go in `apikey` only; legacy service_role keys are JWTs and also go in Authorization
  const legacyJwt = key().startsWith("eyJ");
  return { apikey: key(), ...(legacyJwt ? { Authorization: `Bearer ${key()}` } : {}), ...extra };
}

type DbRow = Record<string, unknown>;

/** Reads a whole table, paging past PostgREST's 1000-row cap */
async function selectAll(table: string, order: string): Promise<DbRow[]> {
  const out: DbRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const res = await fetch(`${url()}/rest/v1/${table}?select=*&order=${order}`, {
      headers: headers({ Range: `${from}-${from + page - 1}` }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${(await res.text()).slice(0, 160)}`);
    const rows = (await res.json()) as DbRow[];
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

/** Blank, never a default: a null column stays a missing value and is raised as a gap */
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export interface RemoteResult {
  dataset: Dataset;
  decisions: Record<string, Decision>;
  fixes: Record<string, DataFix>;
}

/** Throws if Supabase is unreachable or the key is wrong; callers fall back to the bundled CSVs */
export async function loadRemote(): Promise<RemoteResult> {
  const [skus, sales, inventory, distributors, decisions, fixRows] = await Promise.all([
    selectAll("skus", "id"),
    selectAll("weekly_sales", "sku_id,week"),
    selectAll("inventory", "sku_id,location"),
    selectAll("distributors", "id"),
    selectAll("decisions", "sku_id"),
    selectAll("data_fixes", "sku_id,field"),
  ]);
  if (!skus.length) throw new Error("skus table is empty: run supabase/seed.sql");

  const dataset = buildDataset(
    {
      skuMaster: skus.map((r) => ({
        SKU_ID: s(r.id),
        SKU_Name: s(r.name),
        Category: s(r.category),
        Perishability: r.perishable === null || r.perishable === undefined ? "" : r.perishable ? "High" : "Low",
        Standard_Reorder_Qty: s(r.reorder_qty),
        Unit_of_Measure: s(r.unit_of_measure),
        Distributor_ID: s(r.distributor_id),
      })),
      prices: skus.map((r) => ({ SKU_ID: s(r.id), Unit_Cost: s(r.unit_cost), Unit_Price: s(r.unit_price), Source: s(r.price_source) })),
      weeklySales: sales.map((r) => ({ SKU_ID: s(r.sku_id), Week: s(r.week), Units_Sold: s(r.units_sold) })),
      inventory: inventory.map((r) => ({ SKU_ID: s(r.sku_id), Location: s(r.location), Units_On_Hand: s(r.units_on_hand), As_Of_Date: s(r.as_of_date) })),
      distributors: distributors.map((r) => ({ Distributor_ID: s(r.id), Distributor_Name: s(r.name), Region: s(r.region), Status: r.active ? "Active" : "Inactive" })),
    },
    "supabase"
  );

  const saved: Record<string, Decision> = {};
  for (const r of decisions) {
    saved[s(r.sku_id)] = {
      state: s(r.state) as Decision["state"],
      qty: r.qty === null || r.qty === undefined ? undefined : Number(r.qty),
      reason: r.reason ? s(r.reason) : undefined,
    };
  }

  const fixes: Record<string, DataFix> = {};
  for (const r of fixRows) {
    const fix: DataFix = {
      skuId: s(r.sku_id),
      field: s(r.field) as FixField,
      value: r.value as DataFix["value"],
      note: s(r.note),
      source: s(r.source) === "import" ? "import" : s(r.source) === "zoho" ? "zoho" : "planner",
      at: s(r.fixed_at),
    };
    fixes[fixKey(fix.skuId, fix.field)] = fix;
  }
  return { dataset, decisions: saved, fixes };
}

/** Loads from Supabase when configured, otherwise (or on any failure) from the bundled CSVs */
export async function loadServerDataset(): Promise<RemoteResult & { error?: string }> {
  if (supabaseConfigured()) {
    try {
      return await loadRemote();
    } catch (err) {
      return { dataset: loadDataset(), decisions: {}, fixes: {}, error: err instanceof Error ? err.message : "Supabase request failed" };
    }
  }
  return { dataset: loadDataset(), decisions: {}, fixes: {} };
}

async function upsert(table: string, conflict: string, rows: object[]) {
  if (!rows.length) return;
  const res = await fetch(`${url()}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${(await res.text()).slice(0, 160)}`);
}

async function remove(table: string, filter: string) {
  const res = await fetch(`${url()}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${(await res.text()).slice(0, 160)}`);
}

/**
 * Makes the decisions table match the payload: upserts what is there and deletes what is not.
 * Submitted rows are kept so a reload cannot approve and push the same SKU twice.
 */
export async function saveDecisions(decisions: Record<string, Decision>, decidedBy = "planner"): Promise<number> {
  const now = new Date().toISOString();
  const rows = Object.entries(decisions).map(([sku_id, d]) => ({
    sku_id,
    state: d.state,
    qty: d.qty ?? null,
    reason: d.reason ?? null,
    decided_by: decidedBy,
    decided_at: now,
  }));
  await upsert("decisions", "sku_id", rows);
  if (!rows.length) {
    await remove("decisions", "sku_id=not.is.null");
    return 0;
  }
  const existing = (await selectAll("decisions", "sku_id")).map((r) => s(r.sku_id));
  const keep = new Set(Object.keys(decisions));
  for (const id of existing) if (!keep.has(id)) await remove("decisions", `sku_id=eq.${encodeURIComponent(id)}`);
  return rows.length;
}

/** Same replace semantics for human data fixes, so the audit trail matches what the app shows */
export async function saveFixes(fixes: Record<string, DataFix>, fixedBy = "planner"): Promise<number> {
  const rows = Object.values(fixes).map((f) => ({
    sku_id: f.skuId,
    field: f.field,
    value: f.value,
    note: f.note,
    source: f.source,
    fixed_by: fixedBy,
    fixed_at: f.at,
  }));
  await upsert("data_fixes", "sku_id,field", rows);
  if (!rows.length) {
    await remove("data_fixes", "sku_id=not.is.null");
    return 0;
  }
  const existing = await selectAll("data_fixes", "sku_id,field");
  const keep = new Set(Object.keys(fixes));
  for (const r of existing) {
    if (!keep.has(fixKey(s(r.sku_id), s(r.field) as FixField)))
      await remove("data_fixes", `sku_id=eq.${encodeURIComponent(s(r.sku_id))}&field=eq.${encodeURIComponent(s(r.field))}`);
  }
  return rows.length;
}
