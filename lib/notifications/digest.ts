import { activeFestivalName } from "../calendar";
import { globalGaps, resolveAll, summarizeGaps } from "../data/quality";
import { loadServerDataset } from "../data/supabase";
import {
  analyzeSku,
  atRiskValue,
  defaultFestivalConfig,
  effectiveQty,
  excessUnits,
  FESTIVAL_SEGMENTS,
  isFastTrack,
  priceUnknown,
} from "../engine/heuristics";
import { generateSuppliers } from "../mockData";
import type { Digest } from "./types";

/** Seed of the sample supplier list: only used to validate supplier ids on fixes */
const DATA_SEED = 42;

export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3100";
}

function istDay(now: Date): string {
  return now.toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Kolkata" });
}

/**
 * Builds the digest from the heuristics engine.
 * SKUs come from Supabase when configured (otherwise the bundled CSVs), with the planner's saved data fixes applied.
 * Nothing is assumed: SKUs with missing data are excluded from every count and raised under "data gaps".
 * "Ready for approval" excludes SKUs already approved or pushed, using the decisions saved in Supabase.
 */
export async function buildDigest(now = new Date()): Promise<Digest> {
  const suppliers = generateSuppliers(DATA_SEED);
  const { dataset, decisions, fixes } = await loadServerDataset();
  const skus = resolveAll(dataset.raws, { meta: dataset.meta, suppliers, distributors: dataset.distributors, fixes, poAdds: {}, now });
  const festival = defaultFestivalConfig(now);
  const analyses = skus.map((s) => analyzeSku(s, festival));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const critical = analyses.filter((a) => a.status === "critical");
  const overstock = analyses.filter((a) => a.status === "overstock");
  const ready = analyses.filter((a) => isFastTrack(a) && !(["approved", "submitted"] as string[]).includes(decisions[a.sku.id]?.state ?? ""));

  const topCritical = [...critical]
    .sort((a, b) => b.sku.sales4w * (b.stockoutBelow - b.weeksOfCover) - a.sku.sales4w * (a.stockoutBelow - a.weeksOfCover))
    .slice(0, 3)
    .map((a) => ({
      id: a.sku.id,
      name: a.sku.name,
      coverWeeks: a.weeksOfCover,
      weeklyVelocity: a.velocity,
      recommendedQty: effectiveQty(a),
      orderValue: priceUnknown(a) ? 0 : effectiveQty(a) * a.sku.unitCost,
      supplier: a.sku.supplierId ? (supplierName.get(a.sku.supplierId) ?? a.sku.supplierId) : "Supplier not assigned",
      lostSales: atRiskValue(a),
    }));

  const gaps = summarizeGaps(skus);
  const global = globalGaps(dataset.meta, festival, now);

  const day = istDay(now);
  const scheduled = day === "Tuesday" || day === "Thursday";

  return {
    generatedAt: now.toISOString(),
    runLabel: scheduled ? day : "Manual Test",
    dateLabel: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    totalSkus: skus.length,
    critical: { count: critical.length, lostSales: critical.reduce((s, a) => s + atRiskValue(a), 0) },
    overstock: { count: overstock.length, tiedUpCapital: overstock.reduce((s, a) => s + (priceUnknown(a) ? 0 : excessUnits(a) * a.sku.unitCost), 0) },
    readyForApproval: { count: ready.length, orderValue: ready.reduce((s, a) => s + a.recommendedQty * a.sku.unitCost, 0) },
    festival: {
      active: festival.active,
      name: activeFestivalName(now),
      upliftPct: festival.uplift[FESTIVAL_SEGMENTS[0]] ?? 0,
      segments: FESTIVAL_SEGMENTS,
    },
    payables: null,
    dataGaps: {
      blockedSkus: gaps.blockedSkus,
      totalGaps: gaps.totalGaps,
      byLabel: gaps.byLabel.slice(0, 6),
      global: global.map((g) => g.label),
      url: `${appBaseUrl()}/data-gaps`,
    },
    topCritical,
    workbenchUrl: `${appBaseUrl()}/demand-planning`,
  };
}
