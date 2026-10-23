import { parseCsv } from "../csv";
import type { Category, Distributor, Sku, Supplier, SupplierCategory } from "../types";
import { RAW } from "./raw";

type Row = Record<string, string>;

/** CSV text to records keyed by the header names exactly as written */
function records(text: string): Row[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const num = (v: string | undefined, fallback = 0) => {
  const n = Number(v);
  return v === undefined || v === "" || Number.isNaN(n) ? fallback : n;
};

/** Year-month ("2026-10") to whether it is a festival month, from calendar.csv */
export const FESTIVAL_CALENDAR: Record<string, boolean> = Object.fromEntries(
  records(RAW.calendar).map((r) => [r.Year_Month, r.Is_Festival_Month.toUpperCase() === "TRUE"])
);

const CATEGORY_SUPPLIERS: Record<Category, SupplierCategory[]> = {
  Beverage: ["Raw Ingredients", "Packaging Material"],
  Snack: ["Raw Ingredients", "Oil/Ghee", "Packaging Material"],
  Staple: ["Raw Ingredients", "Packaging Material"],
  "Dairy Alt": ["Raw Ingredients", "Packaging Material"],
  Condiment: ["Raw Ingredients", "Spices", "Packaging Material"],
};

export interface DatasetMeta {
  stockAsOf: string;
  salesFromWeek: string;
  salesToWeek: string;
  skuCount: number;
  distributorCount: number;
  /** SKUs whose unit cost and price are placeholders (sku_prices.csv Source = assumed) */
  assumedPrices: number;
}

export interface Dataset {
  skus: Sku[];
  distributors: Distributor[];
  meta: DatasetMeta;
}

function packSize(name: string): string {
  const m = name.match(/(\d+(?:\.\d+)?\s?(?:ml|g|kg|l|bags))\s*$/i);
  return m ? m[1] : "";
}

/**
 * Builds the SKU list from the uploaded files.
 * velocity: 4w and 12w averages are the mean of the latest 4 and 12 weeks in weekly_sales.csv.
 * volatility: coefficient of variation of the latest 12 weeks.
 * Suppliers are not in the files, so each SKU is linked to a sample supplier by category.
 */
export function loadDataset(suppliers: Supplier[]): Dataset {
  const master = records(RAW.skuMaster);
  const sales = records(RAW.weeklySales);
  const inventory = records(RAW.currentInventory);
  const distributors = records(RAW.distributorMaster).map<Distributor>((r) => ({
    id: r.Distributor_ID,
    name: r.Distributor_Name,
    region: r.Region,
    active: r.Status.toLowerCase() === "active",
  }));
  const prices = new Map(records(RAW.skuPrices).map((r) => [r.SKU_ID, r]));

  const weeks = [...new Set(sales.map((r) => r.Week))].sort();
  const last12 = weeks.slice(-12);
  const last4 = weeks.slice(-4);

  const bySku = new Map<string, Map<string, number>>();
  for (const r of sales) {
    const m = bySku.get(r.SKU_ID) ?? new Map<string, number>();
    m.set(r.Week, (m.get(r.Week) ?? 0) + num(r.Units_Sold));
    bySku.set(r.SKU_ID, m);
  }

  const stock = new Map<string, number>();
  for (const r of inventory) stock.set(r.SKU_ID, (stock.get(r.SKU_ID) ?? 0) + num(r.Units_On_Hand));
  const stockAsOf = inventory.map((r) => r.As_Of_Date).sort().pop() ?? "";

  const distributorById = new Map(distributors.map((d) => [d.id, d]));
  const bySupplierCat = new Map<SupplierCategory, Supplier[]>();
  for (const s of suppliers) bySupplierCat.set(s.category, [...(bySupplierCat.get(s.category) ?? []), s]);

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const skus = master.map<Sku>((r, i) => {
    const weekly = bySku.get(r.SKU_ID) ?? new Map<string, number>();
    const series12 = last12.map((w) => weekly.get(w) ?? 0);
    const series4 = last4.map((w) => weekly.get(w) ?? 0);
    const mean12 = avg(series12);
    const sd = Math.sqrt(avg(series12.map((x) => (x - mean12) ** 2)));
    const category = r.Category as Category;
    const price = prices.get(r.SKU_ID);

    const cats = CATEGORY_SUPPLIERS[category] ?? ["Raw Ingredients"];
    const pool = bySupplierCat.get(cats[i % cats.length]) ?? suppliers;
    const supplier = pool[(i * 5 + 2) % pool.length];

    return {
      id: r.SKU_ID,
      name: r.SKU_Name,
      category,
      segment: category,
      perishable: r.Perishability.toLowerCase() === "high",
      packSize: packSize(r.SKU_Name),
      unitCost: num(price?.Unit_Cost),
      unitPrice: num(price?.Unit_Price),
      caseSize: Math.max(1, num(r.Standard_Reorder_Qty, 1)),
      stock: stock.get(r.SKU_ID) ?? 0,
      openPO: 0,
      sales4w: Math.round(avg(series4) * 10) / 10,
      sales12w: Math.round(mean12 * 10) / 10,
      volatility: mean12 > 0 ? Math.round((sd / mean12) * 100) / 100 : 0,
      distributorId: r.Distributor_ID,
      distributorDrop: distributorById.get(r.Distributor_ID)?.active === false,
      supplierId: supplier.id,
    };
  });

  return {
    skus,
    distributors,
    meta: {
      stockAsOf,
      salesFromWeek: weeks[0] ?? "",
      salesToWeek: weeks[weeks.length - 1] ?? "",
      skuCount: skus.length,
      distributorCount: distributors.length,
      assumedPrices: [...prices.values()].filter((p) => p.Source === "assumed").length,
    },
  };
}
