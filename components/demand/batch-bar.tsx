"use client";

import { CloudUpload, FileDown, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { effectiveQty } from "@/lib/engine/heuristics";
import { useDemandStore } from "@/lib/store";
import type { Analysis, PurchaseOrder } from "@/lib/types";
import { downloadFile, formatDate, formatInr, formatNumber, isoDate, toCsv } from "@/lib/utils";

export function BatchBar({ analyses }: { analyses: Analysis[] }) {
  const decisions = useDemandStore((s) => s.decisions);
  const suppliers = useDemandStore((s) => s.suppliers);
  const submitBatch = useDemandStore((s) => s.submitBatch);
  const setQty = useDemandStore((s) => s.setQty);
  const unapprove = useDemandStore((s) => s.unapprove);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<PurchaseOrder[] | null>(null);

  const approved = useMemo(
    () =>
      analyses
        .map((a) => ({ a, qty: effectiveQty(a, decisions[a.sku.id]), state: decisions[a.sku.id]?.state }))
        .filter((x) => x.state === "approved" && x.qty > 0),
    [analyses, decisions]
  );
  const total = approved.reduce((sum, x) => sum + x.qty * x.a.sku.unitCost, 0);

  const bySupplier = useMemo(() => {
    const map = new Map<string, { lines: number; units: number; value: number }>();
    for (const x of approved) {
      const cur = map.get(x.a.sku.supplierId) ?? { lines: 0, units: 0, value: 0 };
      map.set(x.a.sku.supplierId, { lines: cur.lines + 1, units: cur.units + x.qty, value: cur.value + x.qty * x.a.sku.unitCost });
    }
    return [...map.entries()].map(([id, v]) => ({ supplier: suppliers.find((s) => s.id === id), ...v })).sort((a, b) => b.value - a.value);
  }, [approved, suppliers]);

  const close = () => {
    setOpen(false);
    setCreated(null);
  };

  const push = () => {
    const pos = submitBatch(analyses);
    if (!pos.length) return;
    const header = ["po_number", "supplier_id", "supplier", "supplier_email", "sku_id", "item", "quantity", "unit_cost_inr", "line_total_inr", "raised_date", "expected_eta"];
    const rows = pos.flatMap((po) => {
      const sup = suppliers.find((s) => s.id === po.supplierId);
      return po.lines.map((l) => [po.poNumber, po.supplierId, sup?.name ?? "", sup?.email ?? "", l.skuId, l.name, l.qty, l.unitCost, Math.round(l.qty * l.unitCost), po.raisedDate, po.eta]);
    });
    downloadFile(`freshroots-batch-po-${isoDate(new Date())}.csv`, toCsv([header, ...rows]));
    setCreated(pos);
    toast.success(`${pos.length} purchase orders pushed`, "CSV downloaded. POs are live on the Supplier Desk.");
  };

  return (
    <>
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Approved SKUs</p>
            <p className="text-lg font-semibold tabular-nums text-zinc-50">{approved.length}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Est. order value</p>
            <p className="text-lg font-semibold tabular-nums text-emerald-300">{formatInr(total)}</p>
          </div>
          <div className="hidden text-xs text-zinc-500 md:block">{bySupplier.length > 0 ? `${bySupplier.length} suppliers · ${formatNumber(approved.reduce((s, x) => s + x.qty, 0))} units` : "Approve SKUs to build the batch"}</div>
          <Button className="ml-auto" variant="primary" disabled={!approved.length} onClick={() => setOpen(true)}>
            <CloudUpload className="h-4 w-4" />
            Submit &amp; Push to Zoho Inventory
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onClose={close}
        title={created ? "Batch pushed" : "Review batch before pushing"}
        description={created ? "Purchase orders were created and the CSV was downloaded." : "One PO is raised per supplier. A procurement-ready CSV downloads on confirm."}
        className="max-w-3xl"
        footer={
          created ? (
            <>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
              <Button variant="primary" onClick={() => router.push("/suppliers")}>
                View on Supplier Desk
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button variant="primary" onClick={push} disabled={!approved.length}>
                <FileDown className="h-4 w-4" />
                Confirm, push &amp; download CSV
              </Button>
            </>
          )
        }
      >
        {created ? (
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {created.map((po) => (
              <li key={po.poNumber} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="font-mono text-xs text-indigo-300">{po.poNumber}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-300">{suppliers.find((s) => s.id === po.supplierId)?.name}</span>
                <span className="tabular-nums text-zinc-400">{po.lines.length} lines</span>
                <span className="w-28 text-right font-medium tabular-nums text-zinc-100">{formatInr(po.total)}</span>
                <span className="hidden text-xs text-zinc-500 sm:inline">ETA {formatDate(po.eta)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-4">
            <div className="max-h-72 overflow-auto rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr>
                    <th className="th">SKU</th>
                    <th className="th">Supplier</th>
                    <th className="th w-28 text-right">Qty</th>
                    <th className="th text-right">Value</th>
                    <th className="th w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {approved.map((x) => (
                    <tr key={x.a.sku.id}>
                      <td className="td">
                        <p className="max-w-[220px] truncate text-zinc-200" title={x.a.sku.name}>
                          {x.a.sku.name}
                        </p>
                        <p className="font-mono text-[10px] text-zinc-600">{x.a.sku.id}</p>
                      </td>
                      <td className="td max-w-[160px] truncate text-xs text-zinc-400">{suppliers.find((s) => s.id === x.a.sku.supplierId)?.name}</td>
                      <td className="td text-right">
                        <input
                          type="number"
                          min={0}
                          step={x.a.sku.caseSize}
                          value={x.qty}
                          onChange={(e) => setQty(x.a.sku.id, Number(e.target.value) || 0)}
                          aria-label={`Quantity for ${x.a.sku.name}`}
                          className="h-7 w-24 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-right text-sm tabular-nums text-zinc-100 focus:border-indigo-500/60 focus:outline-none"
                        />
                      </td>
                      <td className="td text-right tabular-nums">{formatInr(x.qty * x.a.sku.unitCost)}</td>
                      <td className="td">
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove from batch" onClick={() => unapprove(x.a.sku.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60">
                  <tr>
                    <th className="th">Supplier</th>
                    <th className="th text-right">Lines</th>
                    <th className="th text-right">Units</th>
                    <th className="th text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {bySupplier.map((r) => (
                    <tr key={r.supplier?.id}>
                      <td className="td text-zinc-200">
                        {r.supplier?.name}
                        <span className="ml-2 text-xs text-zinc-600">{r.supplier?.paymentTerms}</span>
                      </td>
                      <td className="td text-right tabular-nums">{r.lines}</td>
                      <td className="td text-right tabular-nums">{formatNumber(r.units)}</td>
                      <td className="td text-right font-medium tabular-nums">{formatInr(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-zinc-700 bg-zinc-900/60">
                  <tr>
                    <td className="td font-medium text-zinc-100">{bySupplier.length} purchase orders</td>
                    <td className="td text-right tabular-nums">{approved.length}</td>
                    <td className="td text-right tabular-nums">{formatNumber(approved.reduce((s, x) => s + x.qty, 0))}</td>
                    <td className="td text-right font-semibold tabular-nums text-emerald-300">{formatInr(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-zinc-500">
              This workspace has no live Zoho connection: the CSV is the import file for Zoho Inventory, and the POs appear on the Supplier Desk as
              Sent with payment pending approval.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}
