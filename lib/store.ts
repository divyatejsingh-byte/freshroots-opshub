"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { analyzeSku, defaultFestivalConfig, effectiveQty, overstockSaving, potentialSaving, stockoutSaving } from "./engine/heuristics";
import { loadDataset, type DatasetMeta } from "./data/load";
import { fixKey, globalGaps, resolveAll } from "./data/quality";
import { generateSuppliers } from "./mockData";
import type {
  Analysis,
  DataFix,
  Decision,
  Distributor,
  FestivalConfig,
  FixField,
  GlobalGap,
  PaymentStatus,
  ProcurementStatus,
  PurchaseOrder,
  RawSku,
  Segment,
  Sku,
  Supplier,
} from "./types";
import { toast } from "@/components/ui/toast";
import { addDays, isoDate } from "./utils";

const DEFAULT_SEED = 42;

export interface IngestRecord {
  source: "SAP Sales Export" | "Zoho Inventory POs";
  fileName: string;
  rows: number;
  matched: number;
  at: string;
}

export interface FixInput {
  skuId: string;
  field: FixField;
  value: number | string | boolean;
}

interface DemandState {
  seed: number;
  /** What the source files contain, with nulls where data is missing */
  raws: RawSku[];
  /** Planner-supplied values and confirmations that fill the gaps */
  fixes: Record<string, DataFix>;
  /** Units pushed on POs from this app, counted as in transit */
  poAdds: Record<string, number>;
  /** raws + fixes resolved. Fields are unusable while a SKU has gaps. */
  skus: Sku[];
  distributors: Distributor[];
  meta: DatasetMeta;
  suppliers: Supplier[];
  pos: PurchaseOrder[];
  decisions: Record<string, Decision>;
  festival: FestivalConfig;
  ingests: IngestRecord[];

  /** True once the dataset came from Supabase: decisions and fixes are then saved back */
  remote: boolean;
  hydrateRemote: () => Promise<{ source: string; error?: string }>;
  reseed: (seed?: number) => void;
  applyFixes: (inputs: FixInput[], note: string, source?: DataFix["source"]) => void;
  removeFix: (skuId: string, field: FixField) => void;
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

type Resolvable = Pick<DemandState, "raws" | "meta" | "suppliers" | "distributors" | "fixes" | "poAdds">;

function resolve(s: Resolvable): Sku[] {
  return resolveAll(s.raws, { meta: s.meta, suppliers: s.suppliers, distributors: s.distributors, fixes: s.fixes, poAdds: s.poAdds });
}

function fresh(seed: number) {
  const suppliers = generateSuppliers(seed);
  const { raws, distributors, meta } = loadDataset();
  const base = { raws, meta, suppliers, distributors, fixes: {} as Record<string, DataFix>, poAdds: {} as Record<string, number> };
  return {
    seed,
    ...base,
    skus: resolve(base),
    // No purchase history is invented: the list holds only POs raised in this app
    pos: [] as PurchaseOrder[],
    decisions: {} as Record<string, Decision>,
    festival: defaultFestivalConfig(),
    ingests: [] as IngestRecord[],
  };
}

function nextPoNumber(pos: PurchaseOrder[]): number {
  return pos.reduce((m, p) => Math.max(m, Number(p.poNumber.split("-").pop())), 88) + 1;
}

/** SKUs with an unresolved blocking or ordering gap cannot be approved */
const orderable = (skus: Sku[], id: string) => {
  const sku = skus.find((k) => k.id === id);
  return !!sku && !sku.gaps.some((g) => g.severity !== "warning");
};

export const useDemandStore = create<DemandState>((set, get) => ({
  ...fresh(DEFAULT_SEED),

  remote: false,

  hydrateRemote: async () => {
    const res = await fetch("/api/dataset", { cache: "no-store" });
    if (!res.ok) return { source: "csv", error: `Dataset request failed (${res.status})` };
    const json = (await res.json()) as {
      source: string;
      raws: RawSku[];
      distributors: Distributor[];
      meta: DatasetMeta;
      decisions: Record<string, Decision>;
      fixes: Record<string, DataFix>;
      error?: string;
    };
    if (json.source !== "supabase") return { source: json.source, error: json.error };
    // Data first, then flip `remote`, so loading saved decisions and fixes does not trigger a save back
    const next = { raws: json.raws, distributors: json.distributors, meta: json.meta, fixes: json.fixes, suppliers: get().suppliers, poAdds: get().poAdds };
    set({ ...next, skus: resolve(next), decisions: json.decisions });
    set({ remote: true });
    return { source: "supabase" };
  },

  reseed: (seed) => set(fresh(seed ?? get().seed + 1)),

  applyFixes: (inputs, note, source = "planner") =>
    set((s) => {
      const at = new Date().toISOString();
      const fixes = { ...s.fixes };
      for (const i of inputs) fixes[fixKey(i.skuId, i.field)] = { skuId: i.skuId, field: i.field, value: i.value, note, source, at };
      return { fixes, skus: resolve({ ...s, fixes }) };
    }),

  removeFix: (skuId, field) =>
    set((s) => {
      const fixes = { ...s.fixes };
      delete fixes[fixKey(skuId, field)];
      return { fixes, skus: resolve({ ...s, fixes }) };
    }),

  setQty: (skuId, qty) =>
    set((s) => ({
      decisions: {
        ...s.decisions,
        [skuId]: { ...s.decisions[skuId], state: s.decisions[skuId]?.state ?? "pending", qty: Math.max(0, Math.round(qty)) },
      },
    })),

  approve: (skuId) =>
    set((s) => (orderable(s.skus, skuId) ? { decisions: { ...s.decisions, [skuId]: { ...s.decisions[skuId], state: "approved" } } } : s)),

  unapprove: (skuId) =>
    set((s) => ({ decisions: { ...s.decisions, [skuId]: { ...s.decisions[skuId], state: "pending" } } })),

  pause: (skuId) =>
    set((s) => ({ decisions: { ...s.decisions, [skuId]: { ...s.decisions[skuId], state: "paused", qty: 0 } } })),

  override: (skuId, qty, reason) =>
    set((s) =>
      orderable(s.skus, skuId)
        ? { decisions: { ...s.decisions, [skuId]: { state: "approved", qty: Math.max(0, Math.round(qty)), reason } } }
        : s
    ),

  batchApprove: (items) =>
    set((s) => {
      const next = { ...s.decisions };
      for (const { id, qty } of items) {
        if (!orderable(s.skus, id)) continue;
        const prev = next[id];
        next[id] = { ...prev, state: "approved", qty: prev?.qty ?? qty };
      }
      return { decisions: next };
    }),

  submitBatch: (analyses) => {
    const { decisions, pos, suppliers } = get();
    const approved = analyses
      .map((a) => ({ a, d: decisions[a.sku.id], qty: effectiveQty(a, decisions[a.sku.id]) }))
      .filter((x) => x.d?.state === "approved" && x.qty > 0 && x.a.blockers.length === 0 && x.a.orderGaps.length === 0);
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
      const poAdds = { ...s.poAdds };
      for (const x of approved) {
        decisionsNext[x.a.sku.id] = { ...decisionsNext[x.a.sku.id], state: "submitted", saving: stockoutSaving(x.a) };
        poAdds[x.a.sku.id] = (poAdds[x.a.sku.id] ?? 0) + x.qty;
      }
      // In-transit stock now counts toward weeks of cover
      return { pos: [...created.reverse(), ...s.pos], decisions: decisionsNext, poAdds, skus: resolve({ ...s, poAdds }) };
    });
    return created;
  },

  // Choosing is itself the confirmation when the calendar has no row for the month
  setFestivalActive: (active) => set((s) => ({ festival: { ...s.festival, active, confirmed: true } })),

  setUplift: (segment, pct) => set((s) => ({ festival: { ...s.festival, uplift: { ...s.festival.uplift, [segment]: pct } } })),

  applyIngest: (source, fileName, patches) => {
    const known = new Set(get().raws.map((r) => r.id));
    const inputs: FixInput[] = [];
    let matched = 0;
    for (const p of patches) {
      if (!known.has(p.skuId)) continue;
      matched++;
      if (p.stock !== undefined) inputs.push({ skuId: p.skuId, field: "stock", value: p.stock });
      if (p.openPO !== undefined) inputs.push({ skuId: p.skuId, field: "openPO", value: p.openPO });
      if (p.sales4w !== undefined && p.sales12w !== undefined) {
        inputs.push({ skuId: p.skuId, field: "avg4w", value: p.sales4w }, { skuId: p.skuId, field: "avg12w", value: p.sales12w });
      }
    }
    get().applyFixes(inputs, `Imported from ${fileName}`, "import");
    set((s) => ({ ingests: [{ source, fileName, rows: patches.length, matched, at: new Date().toISOString() }, ...s.ingests] }));
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

/** Dataset-wide gaps (calendar, stale sales feed) */
export function useGlobalGaps(): GlobalGap[] {
  const meta = useDemandStore((s) => s.meta);
  const festival = useDemandStore((s) => s.festival);
  return useMemo(() => globalGaps(meta, festival), [meta, festival]);
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

// Save planner decisions and data fixes to Supabase (debounced) once the dataset came from there
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let warned = false;
useDemandStore.subscribe((state, prev) => {
  if (!state.remote || (state.decisions === prev.decisions && state.fixes === prev.fixes)) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const { decisions, fixes } = useDemandStore.getState();
      const res = await fetch("/api/dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions, fixes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      warned = false;
    } catch (err) {
      if (!warned) toast.warning("Could not save to Supabase", err instanceof Error ? err.message : undefined);
      warned = true;
    }
  }, 700);
});
