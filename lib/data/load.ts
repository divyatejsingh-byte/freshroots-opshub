import { parseCsv } from "../csv";
import type { Distributor, RawSku } from "../types";
import { RAW } from "./raw";
import { weekWindow } from "./week";

type Row = Record<string, string>;

/** CSV text to records keyed by the header names exactly as written */
function records(text: string): Row[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** A number, or null when the cell is blank or not numeric. Never a default. */
const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const textOrNull = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

/** Year-month ("2026-10") to whether it is a festival month, from calendar.csv */
export const FESTIVAL_CALENDAR: Record<string, boolean> = Object.fromEntries(
  records(RAW.calendar).map((r) => [r.Year_Month, r.Is_Festival_Month.toUpperCase() === "TRUE"])
);

export type DataSource = "csv" | "supabase";

/** Length of the sales window the engine needs (the 12-week baseline) */
export const SALES_WINDOW_WEEKS = 12;

export interface DatasetMeta {
  source: DataSource;
  stockAsOf: string;
  salesFromWeek: string;
  salesToWeek: string;
  /** The expected 12 weeks, oldest first, ending at the latest week in the data */
  weeks: string[];
  skuCount: number;
  distributorCount: number;
}

export interface Dataset {
  raws: RawSku[];
  distributors: Distributor[];
  meta: DatasetMeta;
}

/** Source-agnostic rows, keyed by the CSV header names (Supabase rows are mapped into this shape) */
export interface SourceRows {
  skuMaster: Row[];
  weeklySales: Row[];
  inventory: Row[];
  distributors: Row[];
  /** Optional: unit cost and price. Absent or blank means unknown. */
  prices: Row[];
}

export function loadDataset(): Dataset {
  return buildDataset(
    {
      skuMaster: records(RAW.skuMaster),
      weeklySales: records(RAW.weeklySales),
      inventory: records(RAW.currentInventory),
      distributors: records(RAW.distributorMaster),
      prices: records(RAW.skuPrices),
    },
    "csv"
  );
}

/**
 * Reads the source rows exactly as they are. Nothing is defaulted: a blank or absent value stays null
 * and is raised as a data gap (lib/data/quality.ts) for a person to resolve.
 */
export function buildDataset(rows: SourceRows, source: DataSource): Dataset {
  const distributors = rows.distributors.map<Distributor>((r) => ({
    id: r.Distributor_ID,
    name: r.Distributor_Name,
    region: r.Region,
    active: r.Status.toLowerCase() === "active",
  }));
  const prices = new Map(rows.prices.map((r) => [r.SKU_ID, r]));

  const allWeeks = [...new Set(rows.weeklySales.map((r) => r.Week))].sort();
  const lastWeek = allWeeks[allWeeks.length - 1] ?? "";

  const weeklyBySku = new Map<string, Record<string, number>>();
  for (const r of rows.weeklySales) {
    const units = numOrNull(r.Units_Sold);
    if (units === null) continue; // a blank sales cell is a missing week, not zero
    const m = weeklyBySku.get(r.SKU_ID) ?? {};
    m[r.Week] = (m[r.Week] ?? 0) + units;
    weeklyBySku.set(r.SKU_ID, m);
  }

  const stock = new Map<string, { units: number; asOf: string | null }>();
  for (const r of rows.inventory) {
    const units = numOrNull(r.Units_On_Hand);
    if (units === null) continue;
    const cur = stock.get(r.SKU_ID);
    stock.set(r.SKU_ID, { units: (cur?.units ?? 0) + units, asOf: [cur?.asOf, textOrNull(r.As_Of_Date)].filter(Boolean).sort().pop() ?? null });
  }

  const raws = rows.skuMaster.map<RawSku>((r) => {
    const perish = r.Perishability.trim().toLowerCase();
    const price = prices.get(r.SKU_ID);
    return {
      id: r.SKU_ID,
      name: r.SKU_Name,
      category: textOrNull(r.Category),
      perishable: perish === "high" ? true : perish === "low" ? false : null,
      reorderQty: numOrNull(r.Standard_Reorder_Qty),
      distributorId: textOrNull(r.Distributor_ID),
      unitCost: numOrNull(price?.Unit_Cost),
      unitPrice: numOrNull(price?.Unit_Price),
      stock: stock.get(r.SKU_ID)?.units ?? null,
      stockAsOf: stock.get(r.SKU_ID)?.asOf ?? null,
      openPO: null, // no open-PO source yet: always asked of a person
      supplierId: null, // no SKU-to-vendor source yet: always asked of a person
      weekly: weeklyBySku.get(r.SKU_ID) ?? {},
    };
  });

  return {
    raws,
    distributors,
    meta: {
      source,
      stockAsOf: [...stock.values()].map((s) => s.asOf).filter(Boolean).sort().pop() ?? "",
      salesFromWeek: allWeeks[0] ?? "",
      salesToWeek: lastWeek,
      weeks: lastWeek ? weekWindow(lastWeek, SALES_WINDOW_WEEKS) : [],
      skuCount: raws.length,
      distributorCount: distributors.length,
    },
  };
}
