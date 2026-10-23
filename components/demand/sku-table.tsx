"use client";

import { Check, Pause, PenLine, Play, Undo2, Zap } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/controls";
import { effectiveQty } from "@/lib/engine/heuristics";
import { useDemandStore } from "@/lib/store";
import type { Analysis, Decision, EdgeReason, SkuStatus } from "@/lib/types";
import { cn, formatInr, formatNumber } from "@/lib/utils";

const STATUS: Record<SkuStatus, { label: string; tone: Tone }> = {
  critical: { label: "Stockout risk", tone: "rose" },
  overstock: { label: "Overstock", tone: "rose" },
  healthy: { label: "Healthy", tone: "emerald" },
  nodata: { label: "No baseline", tone: "neutral" },
};

const EDGE_LABEL: Record<EdgeReason, string> = {
  "zero-baseline": "Zero baseline",
  "high-volatility": "High volatility",
  "distributor-drop": "Distributor drop",
};

function coverTone(a: Analysis): "rose" | "emerald" | "amber" | "zinc" {
  if (a.status === "critical" || a.status === "overstock") return "rose";
  if (a.status === "nodata") return "zinc";
  return "emerald";
}

export function SkuTable({
  rows,
  decisions,
  onOverride,
  selected,
  onToggle,
  onTogglePage,
}: {
  rows: Analysis[];
  decisions: Record<string, Decision>;
  onOverride: (a: Analysis) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onTogglePage: (ids: string[], on: boolean) => void;
}) {
  const setQty = useDemandStore((s) => s.setQty);
  const approve = useDemandStore((s) => s.approve);
  const unapprove = useDemandStore((s) => s.unapprove);
  const pause = useDemandStore((s) => s.pause);
  const distributorList = useDemandStore((s) => s.distributors);
  const distributors = new Map(distributorList.map((d) => [d.id, d]));

  if (!rows.length) {
    return <div className="px-4 py-16 text-center text-sm text-zinc-500">No SKUs match this view. Adjust the filters or search.</div>;
  }

  const selectable = rows.filter((a) => {
    const st = decisions[a.sku.id]?.state;
    return st !== "submitted" && st !== "paused";
  });
  const allOn = selectable.length > 0 && selectable.every((a) => selected.has(a.sku.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1220px] border-collapse">
        <thead className="border-b border-zinc-800 bg-zinc-900/50">
          <tr>
            <th className="th w-8">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-indigo-500"
                checked={allOn}
                onChange={(e) =>
                  onTogglePage(
                    selectable.map((a) => a.sku.id),
                    e.target.checked
                  )
                }
                aria-label="Select all SKUs on this page"
              />
            </th>
            <th className="th">SKU ID</th>
            <th className="th">Product</th>
            <th className="th">Category</th>
            <th className="th text-right">Stock</th>
            <th className="th text-right">Open POs</th>
            <th className="th text-right">4w Avg</th>
            <th className="th text-right">12w Avg</th>
            <th className="th w-40">Weeks of cover</th>
            <th className="th">Status</th>
            <th className="th w-32 text-right">Order qty</th>
            <th className="th text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((a) => {
            const d = decisions[a.sku.id];
            const state = d?.state ?? "pending";
            const qty = effectiveQty(a, d);
            const locked = state === "paused" || state === "submitted";
            const st = STATUS[a.status];
            const cover = Number.isFinite(a.weeksOfCover) ? a.weeksOfCover.toFixed(1) : "∞";
            return (
              <tr key={a.sku.id} className={cn("transition-colors hover:bg-zinc-800/30", state === "approved" && "bg-emerald-500/[0.04]", selected.has(a.sku.id) && "bg-indigo-500/[0.07]")}>
                <td className="td">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-indigo-500 disabled:opacity-30"
                    checked={selected.has(a.sku.id)}
                    disabled={locked}
                    onChange={() => onToggle(a.sku.id)}
                    aria-label={`Select ${a.sku.name}`}
                  />
                </td>
                <td className="td font-mono text-xs text-zinc-500">{a.sku.id}</td>
                <td className="td max-w-[260px]">
                  <p className="truncate font-medium text-zinc-100" title={a.sku.name}>
                    {a.sku.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.isSurge && (
                      <Badge tone="amber">
                        <Zap className="h-3 w-3" />+{Math.round(a.surgePct * 100)}% surge · 1.5x
                      </Badge>
                    )}
                    {a.festivalUplift > 0 && <Badge tone="violet">+{Math.round(a.festivalUplift * 100)}% festival</Badge>}
                    {a.sku.perishable && <Badge tone="indigo">Perishable</Badge>}
                    {a.edgeReasons.map((r) => (
                      <Badge key={r} tone="amber">
                        {EDGE_LABEL[r]}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="td text-zinc-400">
                  {a.sku.category}
                  <span className="block text-xs text-zinc-600" title={distributors.get(a.sku.distributorId)?.region}>
                    {distributors.get(a.sku.distributorId)?.name ?? a.sku.distributorId}
                  </span>
                </td>
                <td className="td text-right tabular-nums">{formatNumber(a.sku.stock)}</td>
                <td className="td text-right tabular-nums text-zinc-400">{a.sku.openPO ? formatNumber(a.sku.openPO) : "–"}</td>
                <td className="td text-right tabular-nums">{formatNumber(a.sku.sales4w)}</td>
                <td className="td text-right tabular-nums text-zinc-400">{formatNumber(a.sku.sales12w)}</td>
                <td className="td">
                  <div className="flex items-center gap-2">
                    <span className={cn("w-9 text-right text-xs font-medium tabular-nums", a.status === "healthy" ? "text-zinc-300" : "text-rose-300")}>{cover}</span>
                    <ProgressBar value={Number.isFinite(a.weeksOfCover) ? a.weeksOfCover : a.overstockAbove * 1.5} max={a.overstockAbove * 1.5} tone={coverTone(a)} />
                  </div>
                  <p className="mt-0.5 pl-11 text-[10px] text-zinc-600">
                    {a.stockoutBelow}–{a.overstockAbove} wk band
                  </p>
                </td>
                <td className="td">
                  <Badge tone={st.tone} dot>
                    {st.label}
                  </Badge>
                </td>
                <td className="td text-right">
                  {state === "submitted" ? (
                    <Badge tone="indigo">PO raised</Badge>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step={a.sku.caseSize}
                      value={qty}
                      disabled={locked}
                      onChange={(e) => setQty(a.sku.id, Number(e.target.value) || 0)}
                      aria-label={`Order quantity for ${a.sku.name}`}
                      className="h-8 w-24 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-right text-sm tabular-nums text-zinc-100 hover:border-zinc-700 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-40"
                    />
                  )}
                  <p className="mt-0.5 text-[10px] tabular-nums text-zinc-600">{formatInr(qty * a.sku.unitCost)}</p>
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1.5">
                    {state === "submitted" ? (
                      <span className="text-xs text-zinc-600">Pushed</span>
                    ) : a.status === "overstock" || state === "paused" ? (
                      state === "paused" ? (
                        <Button size="sm" variant="ghost" onClick={() => unapprove(a.sku.id)}>
                          <Play className="h-3 w-3" />
                          Resume
                        </Button>
                      ) : (
                        <Button size="sm" variant="danger" onClick={() => pause(a.sku.id)}>
                          <Pause className="h-3 w-3" />
                          Pause order
                        </Button>
                      )
                    ) : state === "approved" ? (
                      <>
                        <Badge tone="emerald">
                          <Check className="h-3 w-3" />
                          Approved
                        </Badge>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => unapprove(a.sku.id)} aria-label="Undo approval">
                          <Undo2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="success"
                        disabled={qty <= 0}
                        onClick={() => (a.isEdge ? onOverride(a) : approve(a.sku.id))}
                        title={a.isEdge ? "Edge case: needs a reason note" : undefined}
                      >
                        <Check className="h-3 w-3" />
                        Approve
                      </Button>
                    )}
                    {state !== "submitted" && a.status !== "overstock" && state !== "paused" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onOverride(a)} aria-label={`Override ${a.sku.name}`} title="Manual override with reason">
                        <PenLine className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {d?.reason && (
                    <p className="mt-1 max-w-[220px] truncate text-right text-[10px] text-zinc-500" title={d.reason}>
                      “{d.reason}”
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
