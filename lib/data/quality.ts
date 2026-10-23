import type { DataFix, DataGap, Distributor, FestivalConfig, FixField, GlobalGap, RawSku, Sku, Supplier } from "../types";
import { FESTIVAL_CALENDAR, type DatasetMeta } from "./load";
import { lastCompleteWeek, weeksBetween } from "./week";

/**
 * Data-quality gate. Nothing is assumed: where a value is missing the SKU gets a gap, and the numbers
 * stay unusable until a person supplies or confirms them (a DataFix with a recorded reason).
 */

export const KNOWN_CATEGORIES = ["Beverage", "Snack", "Staple", "Dairy Alt", "Condiment"];
/** A stock snapshot older than this many days is raised as a warning */
export const STALE_STOCK_DAYS = 7;

export const fixKey = (skuId: string, field: FixField) => `${skuId}|${field}`;

export const FIELD_LABEL: Record<string, string> = {
  unitCost: "Unit cost",
  unitPrice: "Unit price",
  stock: "Stock on hand",
  openPO: "Open / in-transit PO qty",
  supplierId: "Supplier",
  caseSize: "Standard reorder qty",
  perishable: "Perishability",
  category: "Category",
  distributorId: "Distributor",
  avg4w: "4-week average sales",
  avg12w: "12-week average sales",
};

export const fieldLabel = (f: FixField) => (f.startsWith("sales:") ? `Sales ${f.slice(6)}` : FIELD_LABEL[f] ?? f);

export interface ResolveContext {
  meta: DatasetMeta;
  suppliers: Supplier[];
  distributors: Distributor[];
  fixes: Record<string, DataFix>;
  /** Units pushed on POs from this app: they count as in transit */
  poAdds: Record<string, number>;
  now?: Date;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Applies fixes to what the files contain and reports what is still unresolved */
export function resolveSku(raw: RawSku, ctx: ResolveContext): Sku {
  const now = ctx.now ?? new Date();
  const fix = (f: FixField) => ctx.fixes[fixKey(raw.id, f)];
  const gaps: DataGap[] = [];
  const gap = (field: FixField, severity: DataGap["severity"], label: string, detail: string) =>
    gaps.push({ skuId: raw.id, field, severity, label, detail });

  const num = (f: FixField, fromSource: number | null): number | null => {
    const x = fix(f);
    return x !== undefined && typeof x.value === "number" ? x.value : fromSource;
  };

  // Master data
  const categoryFix = fix("category");
  const category = (typeof categoryFix?.value === "string" ? categoryFix.value : raw.category) ?? null;
  if (!category || !KNOWN_CATEGORIES.includes(category))
    gap("category", "blocking", "Category missing", category ? `"${category}" is not a known category` : "Not in sku_master");

  const perishFix = fix("perishable");
  const perishable = typeof perishFix?.value === "boolean" ? perishFix.value : raw.perishable;
  if (perishable === null) gap("perishable", "blocking", "Perishability missing", "Needed to choose the stockout and overstock thresholds");

  const caseSize = num("caseSize", raw.reorderQty);
  if (caseSize === null || caseSize <= 0) gap("caseSize", "blocking", "Standard reorder qty missing", "Needed to round the order quantity");

  const distFix = fix("distributorId");
  const distributorId = (typeof distFix?.value === "string" ? distFix.value : raw.distributorId) ?? null;
  const distributor = ctx.distributors.find((d) => d.id === distributorId);
  if (!distributorId) gap("distributorId", "blocking", "Distributor missing", "Not in sku_master");
  else if (!distributor) gap("distributorId", "blocking", "Distributor not in master", `${distributorId} is not in distributor_master`);

  // Stock
  const stock = num("stock", raw.stock);
  if (stock === null) gap("stock", "blocking", "Stock on hand missing", "No row in current_inventory");
  else if (raw.stockAsOf && !fix("stock")) {
    const ageDays = Math.floor((now.getTime() - new Date(raw.stockAsOf).getTime()) / 86400000);
    if (ageDays > STALE_STOCK_DAYS) gap("stock", "warning", "Stock snapshot is old", `As of ${raw.stockAsOf} (${ageDays} days ago). Confirm it is still right.`);
  }

  // Open POs: no source exists, so a person must enter the quantity or confirm there is none
  const openFixed = num("openPO", raw.openPO);
  if (openFixed === null) gap("openPO", "blocking", "Open / in-transit POs not confirmed", "No PO source connected. Enter the quantity, or confirm 0.");
  const openPO = (openFixed ?? 0) + (ctx.poAdds[raw.id] ?? 0);

  // Sales history: every expected week must be present, confirmed as zero, or explicitly excluded
  const avg4Fix = fix("avg4w");
  const avg12Fix = fix("avg12w");
  const weeks = ctx.meta.weeks;
  let sales4w = 0;
  let sales12w = 0;
  let volatility = 0;

  if (typeof avg4Fix?.value === "number" && typeof avg12Fix?.value === "number") {
    sales4w = avg4Fix.value;
    sales12w = avg12Fix.value;
  } else {
    const included: { week: string; units: number }[] = [];
    for (const w of weeks) {
      const f = fix(`sales:${w}`);
      if (f?.value === "exclude") continue;
      if (f && typeof f.value === "number") included.push({ week: w, units: f.value });
      else if (w in raw.weekly) included.push({ week: w, units: raw.weekly[w] });
      else gap(`sales:${w}`, "blocking", `Sales missing for ${w}`, "Enter the units, confirm zero, or exclude the week from the averages");
    }
    const last4 = new Set(weeks.slice(-4));
    const recent = included.filter((x) => last4.has(x.week));
    if (!gaps.some((g) => g.field.startsWith("sales:"))) {
      if (!included.length) gap("avg12w", "blocking", "No usable sales weeks", "Every week was excluded. Enter a 12-week average instead.");
      else if (!recent.length) gap("avg4w", "blocking", "No usable sales in the latest 4 weeks", "Enter a 4-week average instead.");
      else {
        sales12w = mean(included.map((x) => x.units));
        sales4w = mean(recent.map((x) => x.units));
        const sd = Math.sqrt(mean(included.map((x) => (x.units - sales12w) ** 2)));
        volatility = sales12w > 0 ? sd / sales12w : 0;
      }
    }
  }

  // Needed to place an order
  const unitCost = num("unitCost", raw.unitCost);
  const unitPrice = num("unitPrice", raw.unitPrice);
  if (unitCost === null) gap("unitCost", "ordering", "Unit cost missing", "Needed for PO value and savings. Not in the files.");
  if (unitPrice === null) gap("unitPrice", "ordering", "Unit price missing", "Needed for lost-sales value. Not in the files.");

  const supFix = fix("supplierId");
  const supplierId = (typeof supFix?.value === "string" ? supFix.value : raw.supplierId) ?? null;
  if (!supplierId) gap("supplierId", "ordering", "Supplier not assigned", "No SKU-to-supplier source. Choose who this is ordered from.");
  else if (!ctx.suppliers.some((s) => s.id === supplierId)) gap("supplierId", "ordering", "Supplier not found", `${supplierId} is not in the supplier list`);

  return {
    id: raw.id,
    name: raw.name,
    category: (category ?? "Snack") as Sku["category"],
    segment: (category ?? "Snack") as Sku["segment"],
    perishable: perishable ?? false,
    packSize: raw.name.match(/(\d+(?:\.\d+)?\s?(?:ml|g|kg|l|bags))\s*$/i)?.[1] ?? "",
    unitCost: unitCost ?? 0,
    unitPrice: unitPrice ?? 0,
    caseSize: caseSize && caseSize > 0 ? caseSize : 1,
    stock: stock ?? 0,
    openPO,
    sales4w: Math.round(sales4w * 10) / 10,
    sales12w: Math.round(sales12w * 10) / 10,
    volatility: Math.round(volatility * 100) / 100,
    distributorId: distributorId ?? "",
    distributorDrop: distributor ? !distributor.active : false,
    supplierId: supplierId ?? "",
    gaps,
  };
}

export function resolveAll(raws: RawSku[], ctx: ResolveContext): Sku[] {
  return raws.map((r) => resolveSku(r, ctx));
}

/** Gaps that apply to the dataset as a whole rather than one SKU */
export function globalGaps(meta: DatasetMeta, festival: FestivalConfig, now = new Date()): GlobalGap[] {
  const out: GlobalGap[] = [];
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (!(key in FESTIVAL_CALENDAR) && !festival.confirmed)
    out.push({ id: "calendar", severity: "blocking", label: `Calendar has no row for ${key}`, detail: "Festival uplift is off until you decide. Use the switch on the Demand Planning page." });

  if (meta.salesToWeek) {
    const behind = weeksBetween(meta.salesToWeek, lastCompleteWeek(now));
    if (behind > 0)
      out.push({ id: "sales-stale", severity: "warning", label: `Sales data is ${behind} week${behind === 1 ? "" : "s"} behind`, detail: `Latest week in the data is ${meta.salesToWeek}; ${lastCompleteWeek(now)} has already ended.` });
  }
  if (!meta.salesToWeek) out.push({ id: "no-sales", severity: "blocking", label: "No sales data loaded", detail: "weekly_sales is empty" });
  return out;
}

export interface GapSummary {
  blockedSkus: number;
  skusWithGaps: number;
  totalGaps: number;
  /** label -> count, most common first */
  byLabel: { label: string; count: number }[];
}

export function summarizeGaps(skus: Sku[]): GapSummary {
  const counts = new Map<string, number>();
  let blocked = 0;
  let withGaps = 0;
  let total = 0;
  for (const s of skus) {
    const real = s.gaps.filter((g) => g.severity !== "warning");
    if (real.length) blocked++;
    if (s.gaps.length) withGaps++;
    for (const g of s.gaps) {
      total++;
      const label = g.field.startsWith("sales:") ? "Missing sales weeks" : g.label.replace(/ for .*$/, "");
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return {
    blockedSkus: blocked,
    skusWithGaps: withGaps,
    totalGaps: total,
    byLabel: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}
