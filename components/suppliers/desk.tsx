"use client";

import { ClipboardList, Hourglass, Mail, Truck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, KpiTile } from "@/components/ui/card";
import { SearchInput, Select, Tabs } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { useDemandStore } from "@/lib/store";
import type { PaymentStatus, Supplier, SupplierCategory } from "@/lib/types";
import { formatInr, formatInrCompact } from "@/lib/utils";
import { PoTable } from "./po-table";
import { OnTime } from "./status";
import { SupplierSheet } from "./supplier-sheet";

type View = "directory" | "orders";
type PayFilter = "all" | "pending" | "completed" | "overdue";

const CATEGORIES: SupplierCategory[] = ["Raw Ingredients", "Packaging Material", "Spices", "Oil/Ghee"];

export function SupplierDesk() {
  const suppliers = useDemandStore((s) => s.suppliers);
  const pos = useDemandStore((s) => s.pos);

  const [view, setView] = useState<View>("directory");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<SupplierCategory | "all">("all");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const kpis = useMemo(() => {
    const open = pos.filter((p) => p.procurement !== "Received");
    const transit = pos.filter((p) => p.procurement === "Shipped");
    const pending = pos.filter((p) => p.payment === "Pending Approval");
    const overdue = pos.filter((p) => p.payment === "Overdue");
    const sum = (list: typeof pos) => list.reduce((s, p) => s + p.total, 0);
    return { open, transit, pending, overdue, openValue: sum(open), transitValue: sum(transit), pendingValue: sum(pending), overdueValue: sum(overdue) };
  }, [pos]);

  const invoices = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pos) if (p.payment !== "Paid") map.set(p.supplierId, (map.get(p.supplierId) ?? 0) + p.total);
    return map;
  }, [pos]);

  const q = search.trim().toLowerCase();
  const filteredSuppliers = suppliers.filter(
    (s) => (category === "all" || s.category === category) && (!q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.city.toLowerCase().includes(q))
  );

  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name.toLowerCase()])), [suppliers]);
  const filteredPos = pos.filter((p) => {
    const pay: PaymentStatus = p.payment;
    const okPay = payFilter === "all" || (payFilter === "pending" && pay === "Pending Approval") || (payFilter === "completed" && pay === "Paid") || (payFilter === "overdue" && pay === "Overdue");
    return okPay && (!q || p.poNumber.toLowerCase().includes(q) || supplierName.get(p.supplierId)?.includes(q));
  });

  const forecastPos = pos.filter((p) => p.source === "forecast").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Supplier &amp; Procurement Desk</h1>
        <p className="text-sm text-zinc-500">Vendor directory, raised purchase orders and payment approvals.</p>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-200">
        Sample data: the uploaded files have no supplier master or PO history, so vendors, past POs and the SKU-to-vendor links are generated. POs raised from the
        Demand Planning Studio use your real SKUs and quantities.
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Active vendors" value={suppliers.length} hint="Tier-1 raw and packaging" icon={Users} tone="indigo" />
        <KpiTile
          label="Open procurement requests"
          value={kpis.open.length}
          hint={`${formatInrCompact(kpis.openValue)} total value${forecastPos ? ` · ${forecastPos} from forecasts` : ""}`}
          icon={ClipboardList}
          tone="violet"
        />
        <KpiTile label="In-transit shipments" value={kpis.transit.length} hint={`${formatInrCompact(kpis.transitValue)} on the road`} icon={Truck} tone="amber" />
        <KpiTile
          label="Pending payment approval"
          value={formatInrCompact(kpis.pendingValue)}
          hint={`${kpis.pending.length} POs${kpis.overdue.length ? ` · ${formatInrCompact(kpis.overdueValue)} overdue` : ""}`}
          icon={Hourglass}
          tone="rose"
        />
      </div>

      <Card>
        <div className="px-3 pt-1">
          <Tabs
            tabs={[
              { id: "directory", label: "Supplier Directory", count: suppliers.length },
              { id: "orders", label: "Raised Procurement Requests", count: pos.length },
            ]}
            value={view}
            onChange={setView}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <SearchInput
            className="w-full sm:w-72"
            placeholder={view === "directory" ? "Search vendor, category or city" : "Search PO number or vendor"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {view === "directory" ? (
            <Select value={category} onChange={(e) => setCategory(e.target.value as SupplierCategory | "all")} aria-label="Filter by category">
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          ) : (
            <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
              {(
                [
                  ["all", "All"],
                  ["pending", "Pending Payment Approval"],
                  ["overdue", "Overdue"],
                  ["completed", "Completed"],
                ] as [PayFilter, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setPayFilter(id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${payFilter === id ? "bg-indigo-500/20 text-indigo-200" : "text-zinc-500 hover:text-zinc-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {view === "directory" ? (
          <SupplierTable suppliers={filteredSuppliers} invoices={invoices} onSelect={setSelected} />
        ) : (
          <PoTable pos={filteredPos} suppliers={suppliers} onSupplier={setSelected} />
        )}
      </Card>

      {selected && <SupplierSheet supplierId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SupplierTable({ suppliers, invoices, onSelect }: { suppliers: Supplier[]; invoices: Map<string, number>; onSelect: (id: string) => void }) {
  if (!suppliers.length) return <div className="px-4 py-14 text-center text-sm text-zinc-500">No suppliers match this search.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse">
        <thead className="border-b border-zinc-800 bg-zinc-900/50">
          <tr>
            <th className="th">ID</th>
            <th className="th">Vendor</th>
            <th className="th">Category</th>
            <th className="th">Contact</th>
            <th className="th">Email</th>
            <th className="th">Phone</th>
            <th className="th">Terms</th>
            <th className="th text-right">Pending invoices</th>
            <th className="th">On-time delivery</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {suppliers.map((s) => {
            const due = invoices.get(s.id) ?? 0;
            return (
              <tr key={s.id} onClick={() => onSelect(s.id)} className="cursor-pointer transition-colors hover:bg-zinc-800/30">
                <td className="td font-mono text-xs text-zinc-500">{s.id}</td>
                <td className="td">
                  <p className="font-medium text-zinc-100">{s.name}</p>
                  <p className="text-xs text-zinc-600">{s.city}</p>
                </td>
                <td className="td">
                  <Badge tone="neutral">{s.category}</Badge>
                </td>
                <td className="td text-zinc-300">{s.contact}</td>
                <td className="td">
                  <a href={`mailto:${s.email}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-indigo-300 hover:underline">
                    <Mail className="h-3 w-3" />
                    {s.email}
                  </a>
                </td>
                <td className="td whitespace-nowrap text-zinc-400">{s.phone}</td>
                <td className="td">
                  <Badge tone={s.paymentTerms === "Advance" ? "amber" : "neutral"}>{s.paymentTerms}</Badge>
                </td>
                <td className={`td text-right font-medium tabular-nums ${due > 0 ? "text-amber-300" : "text-zinc-600"}`}>{due > 0 ? formatInr(due) : "–"}</td>
                <td className="td">
                  <OnTime pct={s.onTimePct} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
