import { FESTIVAL_CALENDAR } from "../data/load";
import type { Analysis, Decision, EdgeReason, FestivalConfig, Segment, Sku, SkuStatus } from "../types";

/** Weeks of cover thresholds */
export const THRESHOLDS = {
  standard: { stockoutBelow: 6, overstockAbove: 14, targetCover: 10 },
  perishable: { stockoutBelow: 3, overstockAbove: 4, targetCover: 3.5 },
} as const;

/** 4-week velocity exceeding the 12-week baseline by more than this flags a surge */
export const SURGE_THRESHOLD = 0.2;
export const SURGE_MULTIPLIER = 1.5;
export const VOLATILITY_LIMIT = 0.45;

/** Fallback festival months (0-indexed) for any month missing from calendar.csv: October, November, March */
export const FESTIVAL_MONTHS = [9, 10, 2];
export const DEFAULT_UPLIFT_PCT = 25;
export const FESTIVAL_SEGMENTS: Segment[] = ["Beverage", "Snack", "Staple", "Dairy Alt", "Condiment"];

export function isFestivalMonth(date: Date): boolean {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return key in FESTIVAL_CALENDAR ? FESTIVAL_CALENDAR[key] : FESTIVAL_MONTHS.includes(date.getMonth());
}

export function defaultFestivalConfig(now = new Date()): FestivalConfig {
  return {
    active: isFestivalMonth(now),
    uplift: Object.fromEntries(FESTIVAL_SEGMENTS.map((s) => [s, DEFAULT_UPLIFT_PCT])),
  };
}

export function weeksOfCover(stock: number, openPO: number, weeklyVelocity: number): number {
  if (weeklyVelocity <= 0) return Infinity;
  return (stock + openPO) / weeklyVelocity;
}

export function analyzeSku(sku: Sku, festival: FestivalConfig): Analysis {
  const t = sku.perishable ? THRESHOLDS.perishable : THRESHOLDS.standard;
  const velocity = sku.sales4w > 0 ? sku.sales4w : sku.sales12w;
  const cover = weeksOfCover(sku.stock, sku.openPO, velocity);

  const surgePct = sku.sales12w > 0 ? (sku.sales4w - sku.sales12w) / sku.sales12w : 0;
  const isSurge = sku.sales12w > 0 && surgePct > SURGE_THRESHOLD;
  const multiplier = isSurge ? SURGE_MULTIPLIER : 1;

  const edgeReasons: EdgeReason[] = [];
  if (sku.sales12w <= 0 || sku.sales4w <= 0) edgeReasons.push("zero-baseline");
  if (sku.volatility > VOLATILITY_LIMIT) edgeReasons.push("high-volatility");
  if (sku.distributorDrop) edgeReasons.push("distributor-drop");

  let status: SkuStatus = "healthy";
  if (velocity <= 0) status = "nodata";
  else if (cover < t.stockoutBelow) status = "critical";
  else if (cover > t.overstockAbove) status = "overstock";

  const festivalUplift = festival.active ? (festival.uplift[sku.segment] ?? 0) / 100 : 0;
  const forecastWeekly = velocity * (1 + festivalUplift);

  let recommendedQty = 0;
  if (velocity > 0 && status !== "overstock") {
    const need = forecastWeekly * t.targetCover - (sku.stock + sku.openPO);
    if (need > 0) {
      const scaled = need * multiplier;
      recommendedQty = Math.ceil(scaled / sku.caseSize) * sku.caseSize;
    }
  }

  return {
    sku,
    velocity,
    weeksOfCover: cover,
    status,
    stockoutBelow: t.stockoutBelow,
    overstockAbove: t.overstockAbove,
    surgePct,
    isSurge,
    multiplier,
    festivalUplift,
    edgeReasons,
    isEdge: edgeReasons.length > 0,
    forecastWeekly,
    recommendedQty,
  };
}

export function effectiveQty(a: Analysis, d?: Decision): number {
  return d?.qty ?? a.recommendedQty;
}

/** Clean SKUs governed by deterministic rules: no edge flags and something to order */
export function isFastTrack(a: Analysis): boolean {
  return !a.isEdge && a.recommendedQty > 0;
}

/** Excess units above the overstock ceiling */
export function excessUnits(a: Analysis): number {
  if (a.velocity <= 0) return 0;
  return Math.max(0, a.sku.stock + a.sku.openPO - a.overstockAbove * a.velocity);
}

const QUARTER_CYCLES = 6.5; // bi-weekly cycles in a quarter
const WRITE_OFF_RATE = { standard: 0.18, perishable: 0.65 };

/** Lost sales avoided per quarter by covering a stockout risk */
export function stockoutSaving(a: Analysis): number {
  if (a.status !== "critical") return 0;
  const shortWeeks = a.stockoutBelow - a.weeksOfCover;
  const lostMargin = a.sku.unitPrice - a.sku.unitCost;
  return shortWeeks * a.velocity * lostMargin * QUARTER_CYCLES * 0.5;
}

/** Write-off avoided per quarter by pausing orders on an overstock */
export function overstockSaving(a: Analysis): number {
  if (a.status !== "overstock") return 0;
  const rate = a.sku.perishable ? WRITE_OFF_RATE.perishable : WRITE_OFF_RATE.standard;
  return excessUnits(a) * a.sku.unitCost * rate;
}

export function potentialSaving(a: Analysis): number {
  return stockoutSaving(a) + overstockSaving(a);
}

/** Inventory value exposed to stockout or overstock */
export function atRiskValue(a: Analysis): number {
  if (a.status === "critical") {
    const shortUnits = (a.stockoutBelow - a.weeksOfCover) * a.velocity;
    return shortUnits * a.sku.unitPrice;
  }
  if (a.status === "overstock") return excessUnits(a) * a.sku.unitCost;
  return 0;
}
