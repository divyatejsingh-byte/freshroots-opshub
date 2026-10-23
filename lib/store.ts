"use client";

import { useMemo } from "react";
import { create } from "zustand";
import {
  analyzeSku,
  defaultFestivalConfig,
  effectiveQty,
  overstockSaving,
  potentialSaving,
  stockoutSaving,
} from "./engine/heuristics";
import { loadDataset, type DatasetMeta } from "./data/load";
import { generatePurchaseOrders, generateSuppliers } from "./mockData";
import type {
  Analysis,
  Decision,
  Distributor,
  FestivalConfig,
  PaymentStatus,
  ProcurementStatus,
  PurchaseOrder,
  Segment,
  Sku,
  Supplier,
} from "./types";
import { addDays, isoDate } from "./utils";

const DEFAULT_SEED = 42;

export interface IngestRecord {
  source: "SAP Sales Export" | "Zoho Inventory POs";
  fileName: string;
  rows: number;
  matched: number;
  at: string;
}

interface DemandState {
  seed: number;
  skus: Sku[];
  distributors: Distributor[];
  meta: DatasetMeta;
  suppliers: Supplier[];
  pos: PurchaseOrder[];
  decisions: Record<string, Decision>;
  festival: FestivalConfig;
  ingests: IngestRecord[];

  reseed: (seed?: number) => void;
  setQty: (skuId: string, qty: number) => void;
  approve: (skuId: string) => void;
  unapprove: (skuId: string) => void;
  pause: (skuId: string) => void;
  override: (skuId: string, qty: number, reason: string) => void;
  batchApprove: (items: { id: string; qty: number }[]) => void;
  submitBatch: (analyses: Analysis[]) => PurchaseOrder[];
  setFestivalActive: (active: boolean) => void;
  setUplift: (segment: Segment, pct: number) => void;
  applyIngest: (
    source: IngestRecord["source"],
    fileName: string,
    patches: { skuId: string; stock?: number; sales4w?: number; sales12w?: number; openPO?: number }[]
  ) => number;
  updatePo: (poNumber: string, patch: Partial<Pick<PurchaseOrder, "payment" | "procurement">>) => void;
}

function fresh(seed: number) {
  const suppliers = generateSuppliers(seed);
  const { skus, distributors, meta } = loadDataset(suppliers);
  const pos = generatePurchaseOrders(seed, suppliers, skus);
  return { seed, suppliers, skus, distributors, meta, pos, decisions: {} as Record<string, Decision>, festival: defaultFestivalConfig(), ingests: [] as IngestRecord[] };
}

function nextPoNumber(pos: PurchaseOrder[]): number {
  const max = pos.reduce((m, p) => Math.max(m, Number(p.poNumber.split("-").pop())), 0);
  return max + 1;
}

export const useDemandStore = create<DemandState>((set, get) => ({
  ...fresh(DEFAULT_SEED),

  reseed: (seed) => set(fresh(seed ?? get().seed + 1)),

  setQty: (skuId, qty) =>
    set((s) => ({
      decisions: {
        ...s.decisions,
        [skuId]: { ...s.decisions[skuId], state: s.decisions[skuId]?.state ?? "pending", qty: Math.max(0, Math.round(qty)) },
      },
    })),

  approve: (skuId) =>
    set((s) => ({ decisions: { ...s.decisions, [skuId]: { ...s.decisions[skuId], state: "approved" } } })),

  unapprove: (skuId) =>
    set((s) => ({ decisions: { ...s.decisions, [skuId]: { ...s.decisions[skuId], state: "pending" } } })),

  pause: (skuId) =>
    set((s) => ({ decisions: { ...s.decisions, [skuId]: { ...s.decisions[skuId], state: "paused", qty: 0 } } })),

  override: (skuId, qty, reason) =>
    set((s) => ({
      decisions: { ...s.decisions, [skuId]: { state: "approved", qty: Math.max(0, Math.round(qty)), reason } },
    })),

  batchApprove: (items) =>
    set((s) => {
      const next = { ...s.decisions };
      for (const { id, qty } of items) {
        const prev = next[id];
        next[id] = { ...prev, state: "approved", qty: prev?.qty ?? qty };
      }
      return { decisions: next };
    }),

  submitBatch: (analyses) => {
    const { decisions, pos, suppliers } = get();
    const approved = analyses
      .map((a) => ({ a, d: decisions[a.sku.id], qty: effectiveQty(a, decisions[a.sku.id]) }))
      .filter((x) => x.d?.state === "approved" && x.qty > 0);
    if (!approved.length) return [];

    const bySupplier = new Map<string, typeof approved>();
    for (const x of approved) bySupplier.set(x.a.sku.supplierId, [...(bySupplier.get(x.a.sku.supplierId) ?? []), x]);

    let seq = nextPoNumber(pos);
    const now = new Date();
    const created: PurchaseOrder[] = [];
    for (const [supplierId, items] of bySupplier) {
      const lines = items.map((x) => ({ skuId: x.a.sku.id, name: x.a.sku.name, qty: x.qty, unitCost: x.a.sku.unitCost }));
      const supplier = suppliers.find((s) => s.id === supplierId);
      created.push({
        poNumber: `PO-2026-${String(seq++).padStart(3, "0")}`,
        supplierId,
        lines,
        total: Math.round(lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0)),
        raisedDate: isoDate(now),
        eta: isoDate(addDays(now, supplier?.category === "Packaging Material" ? 12 : 9)),
        payment: "Pending Approval",
        procurement: "Sent",
        source: "forecast",
      });
    }

    set((s) => {
      const decisionsNext = { ...s.decisions };
      const submittedQty = new Map(approved.map((x) => [x.a.sku.id, x.qty]));
      for (const x of approved) decisionsNext[x.a.sku.id] = { ...decisionsNext[x.a.sku.id], state: "submitted", saving: stockoutSaving(x.a) };
      return {
        pos: [...created.reverse(), ...s.pos],
        decisions: decisionsNext,
        // In-transit stock now counts toward weeks of cover
        skus: s.skus.map((k) => (submittedQty.has(k.id) ? { ...k, openPO: k.openPO + (submittedQty.get(k.id) ?? 0) } : k)),
      };
    });
    return created;
  },

  setFestivalActive: (active) => set((s) => ({ festival: { ...s.festival, active } })),

  setUplift: (segment, pct) => set((s) => ({ festival: { ...s.festival, uplift: { ...s.festival.uplift, [segment]: pct } } })),

  applyIngest: (source, fileName, patches) => {
    const index = new Map(patches.map((p) => [p.skuId, p]));
    let matched = 0;
    set((s) => ({
      skus: s.skus.map((k) => {
        const p = index.get(k.id);
        if (!p) return k;
        matched++;
        return {
          ...k,
          stock: p.stock ?? k.stock,
          sales4w: p.sales4w ?? k.sales4w,
          sales12w: p.sales12w ?? k.sales12w,
          openPO: p.openPO ?? k.openPO,
        };
      }),
      ingests: [{ source, fileName, rows: patches.length, matched, at: new Date().toISOString() }, ...s.ingests],
    }));
    return matched;
  },

  updatePo: (poNumber, patch) =>
    set((s) => ({ pos: s.pos.map((p) => (p.poNumber === poNumber ? { ...p, ...patch } : p)) })),
}));

/** All SKUs analysed against the current festival configuration */
export function useAnalyses(): Analysis[] {
  const skus = useDemandStore((s) => s.skus);
  const festival = useDemandStore((s) => s.festival);
  return useMemo(() => skus.map((k) => analyzeSku(k, festival)), [skus, festival]);
}

export interface Savings {
  realised: number;
  potential: number;
}

export function useSavings(analyses: Analysis[]): Savings {
  const decisions = useDemandStore((s) => s.decisions);
  return useMemo(() => {
    let realised = 0;
    let potential = 0;
    for (const a of analyses) {
      const d = decisions[a.sku.id];
      if (d?.state === "submitted") {
        // Cover now includes the new PO, so use the saving locked in at submission
        realised += d.saving ?? 0;
        potential += d.saving ?? 0;
        continue;
      }
      potential += potentialSaving(a);
      if (!d) continue;
      if (a.status === "critical" && d.state === "approved") realised += stockoutSaving(a);
      if (a.status === "overstock" && d.state === "paused") realised += overstockSaving(a);
    }
    return { realised, potential };
  }, [analyses, decisions]);
}

export type { PaymentStatus, ProcurementStatus };
