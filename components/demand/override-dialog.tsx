"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { effectiveQty } from "@/lib/engine/heuristics";
import { useDemandStore } from "@/lib/store";
import type { Analysis } from "@/lib/types";
import { formatInr } from "@/lib/utils";

const REASONS: Record<string, string> = {
  "zero-baseline": "Zero baseline: no reliable sales history",
  "high-volatility": "High volatility: week-on-week demand is erratic",
  "distributor-drop": "Distributor drop: an active distributor paused this SKU",
};

export function OverrideDialog({ analysis, onClose }: { analysis: Analysis | null; onClose: () => void }) {
  const decision = useDemandStore((s) => (analysis ? s.decisions[analysis.sku.id] : undefined));
  const override = useDemandStore((s) => s.override);
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (analysis) {
      setQty(effectiveQty(analysis, decision));
      setReason(decision?.reason ?? "");
    }
    // Reset only when a different SKU is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.sku.id]);

  if (!analysis) return null;
  const { sku } = analysis;
  const valid = reason.trim().length >= 3 && qty >= 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Manual override"
      description={`${sku.id} · ${sku.name}`}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              override(sku.id, qty, reason.trim());
              toast.success("Override approved", `${sku.name}: ${qty} units with note recorded.`);
              onClose();
            }}
          >
            Approve override
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {analysis.edgeReasons.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
            <Badge tone="amber">Edge case</Badge>
            {analysis.edgeReasons.map((r) => (
              <p key={r} className="text-sm text-amber-100/80">
                {REASONS[r]}
              </p>
            ))}
          </div>
        )}
        <dl className="grid grid-cols-3 gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs">
          <div>
            <dt className="text-zinc-500">System recommends</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums text-zinc-100">{analysis.recommendedQty}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Weeks of cover</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums text-zinc-100">{Number.isFinite(analysis.weeksOfCover) ? analysis.weeksOfCover.toFixed(1) : "∞"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Order value</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums text-zinc-100">{formatInr(qty * sku.unitCost)}</dd>
          </div>
        </dl>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">Order quantity (units)</span>
          <Input type="number" min={0} step={sku.caseSize} value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))} />
          <span className="mt-1 block text-xs text-zinc-600">Case size {sku.caseSize} units</span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">Reason note (required)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Confirmed with Pune distributor: restock after Diwali promo"
            className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </label>
      </div>
    </Dialog>
  );
}
