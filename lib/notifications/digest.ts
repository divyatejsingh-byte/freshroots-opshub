import { activeFestivalName } from "../calendar";
import {
  analyzeSku,
  atRiskValue,
  defaultFestivalConfig,
  effectiveQty,
  excessUnits,
  FESTIVAL_SEGMENTS,
  isFastTrack,
} from "../engine/heuristics";
import { loadDataset } from "../data/load";
import { generatePurchaseOrders, generateSuppliers } from "../mockData";
import type { Digest } from "./types";

/** Same seed the app boots with (drives the sample suppliers and POs), so the digest matches the workbench */
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
 * SKUs come from the uploaded files in /data; suppliers and PO history are sample data until a vendor source exists.
 * Planner approvals live in the browser, so "ready for approval" counts the rule-passed lane as it stands at run time.
 */
export function buildDigest(now = new Date()): Digest {
  const suppliers = generateSuppliers(DATA_SEED);
  const { skus } = loadDataset(suppliers);
  const pos = generatePurchaseOrders(DATA_SEED, suppliers, skus);
  const festival = defaultFestivalConfig(now);
  const analyses = skus.map((s) => analyzeSku(s, festival));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const critical = analyses.filter((a) => a.status === "critical");
  const overstock = analyses.filter((a) => a.status === "overstock");
  const ready = analyses.filter(isFastTrack);

  const topCritical = [...critical]
    .sort((a, b) => atRiskValue(b) - atRiskValue(a))
    .slice(0, 3)
    .map((a) => ({
      id: a.sku.id,
      name: a.sku.name,
      coverWeeks: a.weeksOfCover,
      weeklyVelocity: a.velocity,
      recommendedQty: effectiveQty(a),
      orderValue: effectiveQty(a) * a.sku.unitCost,
      supplier: supplierName.get(a.sku.supplierId) ?? a.sku.supplierId,
      lostSales: atRiskValue(a),
    }));

  const pending = pos.filter((p) => p.payment === "Pending Approval");
  const overdue = pos.filter((p) => p.payment === "Overdue");
  const sum = (list: typeof pos) => list.reduce((s, p) => s + p.total, 0);

  const day = istDay(now);
  const scheduled = day === "Tuesday" || day === "Thursday";

  return {
    generatedAt: now.toISOString(),
    runLabel: scheduled ? day : "Manual Test",
    dateLabel: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    totalSkus: skus.length,
    critical: { count: critical.length, lostSales: critical.reduce((s, a) => s + atRiskValue(a), 0) },
    overstock: { count: overstock.length, tiedUpCapital: overstock.reduce((s, a) => s + excessUnits(a) * a.sku.unitCost, 0) },
    readyForApproval: { count: ready.length, orderValue: ready.reduce((s, a) => s + a.recommendedQty * a.sku.unitCost, 0) },
    festival: {
      active: festival.active,
      name: activeFestivalName(now),
      upliftPct: festival.uplift[FESTIVAL_SEGMENTS[0]] ?? 0,
      segments: FESTIVAL_SEGMENTS,
    },
    payables: { pendingApproval: sum(pending), pendingCount: pending.length, overdue: sum(overdue), overdueCount: overdue.length },
    topCritical,
    workbenchUrl: `${appBaseUrl()}/demand-planning`,
  };
}
