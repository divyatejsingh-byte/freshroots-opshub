"use client";

import { AlertOctagon, AlertTriangle, ClipboardEdit, X, ChevronLeft, ChevronRight, ClipboardCheck, Flame, PackageMinus, RefreshCw, Rocket, Timer, UploadCloud, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput, Select, Tabs, type TabDef } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { effectiveQty, isFastTrack } from "@/lib/engine/heuristics";
import { summarizeGaps } from "@/lib/data/quality";
import { useAnalyses, useDemandStore, useGlobalGaps, useSavings } from "@/lib/store";
import type { Analysis, Category } from "@/lib/types";
import { BatchBar } from "./batch-bar";
import { FestivalCard } from "./festival-card";
import { IngestDialog } from "./ingest-dialog";
import { KpiStrip } from "./kpi-strip";
import { OverrideDialog } from "./override-dialog";
import { SkuTable } from "./sku-table";

type TabId = "movers" | "critical" | "overstock" | "fast" | "edge" | "perishable" | "gaps";
type SortId = "default" | "velocity-desc" | "velocity-asc" | "cover-asc" | "cover-desc" | "value-desc";

const PAGE_SIZE = 25;

const TAB_FILTER: Record<TabId, (a: Analysis) => boolean> = {
  movers: () => true,
  critical: (a) => a.status === "critical",
  overstock: (a) => a.status === "overstock",
  fast: isFastTrack,
  edge: (a) => a.isEdge,
  perishable: (a) => a.sku.perishable,
  gaps: (a) => a.blockers.length > 0 || a.orderGaps.length > 0,
};

const TAB_BLURB: Record<TabId, string> = {
  movers: "Top 50 SKUs by 4-week sales volume. A 4-week velocity more than 20% above the 12-week baseline flags a surge and applies a 1.5x order multiplier.",
  critical: "Cover is below the stockout floor. Reorder now to avoid empty shelves.",
  overstock: "Cover is above the ceiling. Pause new orders to avoid write-offs.",
  fast: "Clean SKUs with no edge flags, governed by deterministic rules. Approve the whole lane in one click.",
  edge: "Zero baselines, high volatility or distributor drops. These need your judgement and a reason note before approval.",
  perishable: "Strict 3-4 week inventory windows: stockout below 3 weeks, overstock above 4.",
  gaps: "Data is missing for these SKUs. Nothing is assumed: fill in or confirm each value on the Data Gaps page and the SKU is released.",
};

function sortRows(rows: Analysis[], tab: TabId, sort: SortId, decisions: ReturnType<typeof useDemandStore.getState>["decisions"]): Analysis[] {
  const out = [...rows];
  const value = (a: Analysis) => effectiveQty(a, decisions[a.sku.id]) * a.sku.unitCost;
  const cover = (a: Analysis) => (Number.isFinite(a.weeksOfCover) ? a.weeksOfCover : 999);
  const effective: SortId =
    sort !== "default"
      ? sort
      : tab === "movers"
        ? "velocity-desc"
        : tab === "overstock"
          ? "cover-desc"
          : tab === "fast"
            ? "value-desc"
            : "cover-asc";
  switch (effective) {
    case "velocity-desc":
      return out.sort((a, b) => b.sku.sales4w - a.sku.sales4w);
    case "velocity-asc":
      return out.sort((a, b) => a.sku.sales4w - b.sku.sales4w);
    case "cover-asc":
      return out.sort((a, b) => cover(a) - cover(b));
    case "cover-desc":
      return out.sort((a, b) => cover(b) - cover(a));
    default:
      return out.sort((a, b) => value(b) - value(a));
  }
}

export function DemandStudio() {
  const analyses = useAnalyses();
  const decisions = useDemandStore((s) => s.decisions);
  const festival = useDemandStore((s) => s.festival);
  const seed = useDemandStore((s) => s.seed);
  const meta = useDemandStore((s) => s.meta);
  const skus = useDemandStore((s) => s.skus);
  const categories = useMemo(() => [...new Set(skus.map((s) => s.category))].sort(), [skus]);
  const reseed = useDemandStore((s) => s.reseed);
  const batchApprove = useDemandStore((s) => s.batchApprove);
  const savings = useSavings(analyses);
  const gapSummary = useMemo(() => summarizeGaps(skus), [skus]);
  const globals = useGlobalGaps();

  const [tab, setTab] = useState<TabId>("movers");
  const [category, setCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("default");
  const [page, setPage] = useState(0);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<Analysis | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const unapprove = useDemandStore((s) => s.unapprove);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const togglePage = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const selectedRows = analyses.filter((a) => selected.has(a.sku.id));
  const approveSelected = () => {
    const ok = selectedRows.filter((a) => !a.isEdge && effectiveQty(a, decisions[a.sku.id]) > 0);
    const skipped = selectedRows.length - ok.length;
    batchApprove(ok.map((a) => ({ id: a.sku.id, qty: a.recommendedQty })));
    toast.success(`${ok.length} SKUs approved`, skipped ? `${skipped} skipped: edge cases need an override note, or quantity is 0.` : "Added to the batch.");
    setSelected(new Set());
  };
  const removeSelected = () => {
    selectedRows.forEach((a) => decisions[a.sku.id]?.state === "approved" && unapprove(a.sku.id));
    toast.info("Removed from batch", `${selectedRows.length} SKUs set back to pending.`);
    setSelected(new Set());
  };

  useEffect(() => setPage(0), [tab, category, search, sort]);

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return analyses.filter(
      (a) => (category === "all" || a.sku.category === category) && (!q || a.sku.name.toLowerCase().includes(q) || a.sku.id.toLowerCase().includes(q))
    );
  }, [analyses, category, search]);

  const counts = useMemo(() => {
    const c = {} as Record<TabId, number>;
    (Object.keys(TAB_FILTER) as TabId[]).forEach((t) => {
      const n = base.filter((a) => TAB_FILTER[t](a) && !(t === "fast" && decisions[a.sku.id]?.state === "submitted")).length;
      c[t] = t === "movers" ? Math.min(50, n) : n;
    });
    return c;
  }, [base, decisions]);

  const rows = useMemo(() => {
    let list = base.filter(TAB_FILTER[tab]);
    if (tab === "fast") list = list.filter((a) => decisions[a.sku.id]?.state !== "submitted");
    list = sortRows(list, tab, sort, decisions);
    return tab === "movers" ? list.slice(0, 50) : list;
  }, [base, tab, sort, decisions]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const tabs: TabDef<TabId>[] = [
    { id: "movers", label: "Top Movers & Surges", count: counts.movers, icon: <Flame className="h-3.5 w-3.5" /> },
    { id: "critical", label: "Critical Stockout Risks", count: counts.critical, icon: <AlertOctagon className="h-3.5 w-3.5" /> },
    { id: "overstock", label: "Overstock Warnings", count: counts.overstock, icon: <PackageMinus className="h-3.5 w-3.5" /> },
    { id: "fast", label: "Auto 80% Fast-Track", count: counts.fast, icon: <Rocket className="h-3.5 w-3.5" /> },
    { id: "edge", label: "15-20% Edge Cases", count: counts.edge, icon: <Wrench className="h-3.5 w-3.5" /> },
    { id: "perishable", label: "Perishables Focus", count: counts.perishable, icon: <Timer className="h-3.5 w-3.5" /> },
    { id: "gaps", label: "Data Gaps", count: counts.gaps, icon: <ClipboardEdit className="h-3.5 w-3.5" /> },
  ];

  const pendingFast = rows.filter((a) => tab === "fast" && (decisions[a.sku.id]?.state ?? "pending") === "pending");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Demand Planning Studio</h1>
          <p className="text-sm text-zinc-500">Bi-weekly SKU heuristics, festival buffers and batch PO approvals.</p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {meta.source === "supabase" ? "Source: Supabase" : "Source: bundled CSV files"} · stock as of {meta.stockAsOf} · sales {meta.salesFromWeek} to {meta.salesToWeek}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIngestOpen(true)}>
            <UploadCloud className="h-4 w-4" />
            Ingest SAP &amp; Zoho files
          </Button>
          <Button
            onClick={() => {
              reseed(seed);
              toast.info("Source data reloaded", "Approvals cleared and SKUs reset to the uploaded files.");
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Reload Source Data
          </Button>
        </div>
      </div>

      {(gapSummary.blockedSkus > 0 || globals.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1 text-sm text-amber-100/90">
            {gapSummary.blockedSkus > 0 && (
              <p>
                <span className="font-medium text-amber-200">{gapSummary.blockedSkus} of {skus.length} SKUs are on hold because data is missing.</span> Nothing has been assumed: they are
                left out of every count and cannot be approved until you fill in or confirm the missing values.
              </p>
            )}
            {globals.map((g) => (
              <p key={g.id} className="text-xs text-amber-200/80">
                {g.label}. {g.detail}
              </p>
            ))}
          </div>
          <Link href="/data-gaps" className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-500 px-3.5 text-sm font-medium text-white hover:bg-indigo-400">
            <ClipboardEdit className="h-4 w-4" />
            Resolve data gaps
          </Link>
        </div>
      )}

      <KpiStrip analyses={analyses} festival={festival} savings={savings} gaps={gapSummary} />
      <FestivalCard analyses={analyses} />

      <Card>
        <div className="px-3 pt-1">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <SearchInput className="w-full sm:w-64" placeholder="Search name or SKU ID" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={category} onChange={(e) => setCategory(e.target.value as Category | "all")} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortId)} aria-label="Sort">
            <option value="default">Sort: tab default</option>
            <option value="velocity-desc">Velocity: high to low</option>
            <option value="velocity-asc">Velocity: low to high</option>
            <option value="cover-asc">Cover: lowest first</option>
            <option value="cover-desc">Cover: highest first</option>
            <option value="value-desc">Order value: high to low</option>
          </Select>
          {tab === "fast" && (
            <Button
              className="ml-auto"
              variant="primary"
              disabled={!pendingFast.length}
              onClick={() => {
                batchApprove(pendingFast.map((a) => ({ id: a.sku.id, qty: a.recommendedQty })));
                toast.success(`${pendingFast.length} SKUs approved`, "Fast-track lane added to the batch.");
              }}
            >
              <ClipboardCheck className="h-4 w-4" />
              Batch Approve All ({pendingFast.length})
            </Button>
          )}
        </div>
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-indigo-500/30 bg-indigo-500/10 px-4 py-2">
            <span className="text-sm font-medium text-indigo-200">{selected.size} selected</span>
            <Button size="sm" variant="primary" onClick={approveSelected}>
              <ClipboardCheck className="h-3.5 w-3.5" />
              Approve selected
            </Button>
            <Button size="sm" onClick={removeSelected}>
              Remove from batch
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        ) : (
          <p className="border-b border-zinc-800/70 bg-zinc-900/30 px-4 py-2 text-xs text-zinc-500">
            {TAB_BLURB[tab]} Tick SKUs to approve them in bulk, or edit any order quantity inline.
          </p>
        )}

        <SkuTable rows={pageRows} decisions={decisions} onOverride={setOverrideTarget} selected={selected} onToggle={toggle} onTogglePage={togglePage} />

        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-2.5 text-xs text-zinc-500">
          <span>
            {rows.length === 0 ? "0 SKUs" : `${current * PAGE_SIZE + 1}–${Math.min(rows.length, (current + 1) * PAGE_SIZE)} of ${rows.length} SKUs`}
          </span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 tabular-nums">
              {current + 1} / {pageCount}
            </span>
            <Button size="icon" variant="ghost" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <BatchBar analyses={analyses} />
      <IngestDialog open={ingestOpen} onClose={() => setIngestOpen(false)} />
      <OverrideDialog analysis={overrideTarget} onClose={() => setOverrideTarget(null)} />
    </div>
  );
}
