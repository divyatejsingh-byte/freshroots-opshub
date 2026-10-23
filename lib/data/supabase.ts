import "server-only";
import type { Decision, Supplier } from "../types";
import { buildDataset, loadDataset, type Dataset } from "./load";

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
  return { apikey: key(), Authorization: `Bearer ${key()}`, ...extra };
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

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export interface RemoteResult {
  dataset: Dataset;
  decisions: Record<string, Decision>;
}

/** Throws if Supabase is unreachable or the key is wrong; callers fall back to the bundled CSVs */
export async function loadRemote(suppliers: Supplier[]): Promise<RemoteResult> {
  const [skus, sales, inventory, distributors, decisions] = await Promise.all([
    selectAll("skus", "id"),
    selectAll("weekly_sales", "sku_id,week"),
    selectAll("inventory", "sku_id,location"),
    selectAll("distributors", "id"),
    selectAll("decisions", "sku_id"),
  ]);
  if (!skus.length) throw new Error("skus table is empty: run supabase/seed.sql");

  const dataset = buildDataset(
    {
      skuMaster: skus.map((r) => ({
        SKU_ID: s(r.id),
        SKU_Name: s(r.name),
        Category: s(r.category),
        Perishability: r.perishable ? "High" : "Low",
        Standard_Reorder_Qty: s(r.reorder_qty),
        Unit_of_Measure: s(r.unit_of_measure),
        Distributor_ID: s(r.distributor_id),
      })),
      prices: skus.map((r) => ({ SKU_ID: s(r.id), Unit_Cost: s(r.unit_cost), Unit_Price: s(r.unit_price), Source: s(r.price_source) })),
      weeklySales: sales.map((r) => ({ SKU_ID: s(r.sku_id), Week: s(r.week), Units_Sold: s(r.units_sold) })),
      inventory: inventory.map((r) => ({ SKU_ID: s(r.sku_id), Location: s(r.location), Units_On_Hand: s(r.units_on_hand), As_Of_Date: s(r.as_of_date) })),
      distributors: distributors.map((r) => ({ Distributor_ID: s(r.id), Distributor_Name: s(r.name), Region: s(r.region), Status: r.active ? "Active" : "Inactive" })),
    },
    suppliers,
    "supabase"
  );

  const saved: Record<string, Decision> = {};
  for (const r of decisions) {
    const state = s(r.state) as Decision["state"];
    saved[s(r.sku_id)] = {
      state,
      qty: r.qty === null || r.qty === undefined ? undefined : Number(r.qty),
      reason: r.reason ? s(r.reason) : undefined,
    };
  }
  return { dataset, decisions: saved };
}

/** Loads from Supabase when configured, otherwise (or on any failure) from the bundled CSVs */
export async function loadServerDataset(suppliers: Supplier[]): Promise<RemoteResult & { error?: string }> {
  if (supabaseConfigured()) {
    try {
      return await loadRemote(suppliers);
    } catch (err) {
      return { dataset: loadDataset(suppliers), decisions: {}, error: err instanceof Error ? err.message : "Supabase request failed" };
    }
  }
  return { dataset: loadDataset(suppliers), decisions: {} };
}

/** Upserts planner decisions, including submitted ones so a reload cannot approve and push the same SKU twice */
export async function saveDecisions(decisions: Record<string, Decision>, decidedBy = "planner"): Promise<number> {
  const rows = Object.entries(decisions)
    .map(([sku_id, d]) => ({
      sku_id,
      state: d.state,
      qty: d.qty ?? null,
      reason: d.reason ?? null,
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
    }));
  if (!rows.length) return 0;
  const res = await fetch(`${url()}/rest/v1/decisions?on_conflict=sku_id`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`decisions: ${res.status} ${(await res.text()).slice(0, 160)}`);
  return rows.length;
}

/** Removes every saved decision (used when the planner reloads the source data) */
export async function clearDecisions(): Promise<void> {
  const res = await fetch(`${url()}/rest/v1/decisions?sku_id=not.is.null`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  if (!res.ok) throw new Error(`decisions: ${res.status} ${(await res.text()).slice(0, 160)}`);
}
