"use client";

import { BadgeCheck, FileDown, Mail, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { useDemandStore } from "@/lib/store";
import type { ProcurementStatus, PurchaseOrder, Supplier } from "@/lib/types";
import { downloadFile, formatDate, formatInr, toCsv } from "@/lib/utils";
import { PaymentBadge } from "./status";

const PROCUREMENT: ProcurementStatus[] = ["Draft", "Sent", "Shipped", "Received"];

export function exportPoSummary(po: PurchaseOrder, supplier?: Supplier) {
  const rows = [
    ["po_number", "supplier", "supplier_email", "raised_date", "expected_eta", "payment_status", "procurement_status"],
    [po.poNumber, supplier?.name ?? "", supplier?.email ?? "", po.raisedDate, po.eta, po.payment, po.procurement],
    [],
    ["sku_id", "item", "quantity", "unit_cost_inr", "line_total_inr"],
    ...po.lines.map((l) => [l.skuId, l.name, l.qty, l.unitCost, Math.round(l.qty * l.unitCost)]),
    ["", "", "", "Total", po.total],
  ];
  downloadFile(`${po.poNumber}-summary.csv`, toCsv(rows));
  toast.success("PO summary exported", `${po.poNumber} downloaded as CSV.`);
}

export function sendReminder(po: PurchaseOrder, supplier?: Supplier) {
  if (!supplier) return;
  const subject = `Reminder: ${po.poNumber} (${formatInr(po.total)}) ${po.procurement === "Received" ? "payment status" : "delivery status"}`;
  const body = [
    `Dear ${supplier.contact.split(" ")[0]},`,
    "",
    `This is a reminder regarding purchase order ${po.poNumber} raised on ${formatDate(po.raisedDate)} for ${po.lines.length} line items, totalling ${formatInr(po.total)}.`,
    `Expected delivery: ${formatDate(po.eta)}. Current status: ${po.procurement}, payment ${po.payment}.`,
    "",
    "Please confirm the latest status at your earliest convenience.",
    "",
    "Regards,",
    "Raghav Kulkarni",
    "Senior Demand Planner, Freshroots",
  ].join("\n");
  window.location.href = `mailto:${supplier.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  toast.info("Reminder drafted", `Email to ${supplier.contact} opened in your mail client.`);
}

export function PoTable({
  pos,
  suppliers,
  onSupplier,
  compact,
}: {
  pos: PurchaseOrder[];
  suppliers: Supplier[];
  onSupplier?: (id: string) => void;
  compact?: boolean;
}) {
  const updatePo = useDemandStore((s) => s.updatePo);
  const byId = new Map(suppliers.map((s) => [s.id, s]));

  if (!pos.length) return <div className="px-4 py-14 text-center text-sm text-zinc-500">No purchase orders match this view.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead className="border-b border-zinc-800 bg-zinc-900/50">
          <tr>
            <th className="th">PO number</th>
            {!compact && <th className="th">Supplier</th>}
            <th className="th text-right">Lines</th>
            <th className="th text-right">Order value</th>
            <th className="th">Raised</th>
            <th className="th">ETA</th>
            <th className="th">Payment</th>
            <th className="th">Procurement</th>
            <th className="th text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {pos.map((po) => {
            const sup = byId.get(po.supplierId);
            return (
              <tr key={po.poNumber} className="transition-colors hover:bg-zinc-800/30">
                <td className="td">
                  <span className="font-mono text-xs text-indigo-300">{po.poNumber}</span>
                  {po.source === "forecast" && <span className="ml-2 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">from forecast</span>}
                </td>
                {!compact && (
                  <td className="td">
                    <button className="text-left font-medium text-zinc-100 hover:text-indigo-300" onClick={() => onSupplier?.(po.supplierId)}>
                      {sup?.name}
                    </button>
                  </td>
                )}
                <td className="td text-right tabular-nums">{po.lines.length}</td>
                <td className="td text-right font-medium tabular-nums">{formatInr(po.total)}</td>
                <td className="td text-zinc-400">{formatDate(po.raisedDate)}</td>
                <td className="td text-zinc-400">{formatDate(po.eta)}</td>
                <td className="td">
                  <PaymentBadge status={po.payment} />
                </td>
                <td className="td">
                  <Select
                    className="h-7 px-1.5 text-xs"
                    value={po.procurement}
                    aria-label={`Procurement status for ${po.poNumber}`}
                    onChange={(e) => {
                      updatePo(po.poNumber, { procurement: e.target.value as ProcurementStatus });
                      toast.info(`${po.poNumber} marked ${e.target.value}`);
                    }}
                  >
                    {PROCUREMENT.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </Select>
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1">
                    {po.payment === "Pending Approval" && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => {
                          updatePo(po.poNumber, { payment: "Approved" });
                          toast.success("Payment approved", `${po.poNumber} · ${formatInr(po.total)} released to accounts.`);
                        }}
                      >
                        <BadgeCheck className="h-3 w-3" />
                        Approve
                      </Button>
                    )}
                    {(po.payment === "Approved" || po.payment === "Overdue") && (
                      <Button
                        size="sm"
                        onClick={() => {
                          updatePo(po.poNumber, { payment: "Paid" });
                          toast.success("Marked as paid", po.poNumber);
                        }}
                      >
                        <Wallet className="h-3 w-3" />
                        Mark paid
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => sendReminder(po, sup)} aria-label="Email reminder" title="Email reminder">
                      <Mail className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => exportPoSummary(po, sup)} aria-label="Export PO summary" title="Export PO summary">
                      <FileDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
