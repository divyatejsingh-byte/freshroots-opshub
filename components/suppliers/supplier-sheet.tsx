"use client";

import { Building2, FileText, Mail, MapPin, Phone } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/overlay";
import { useDemandStore } from "@/lib/store";
import { formatDate, formatInr, formatNumber } from "@/lib/utils";
import { PoTable } from "./po-table";
import { OnTime } from "./status";

export function SupplierSheet({ supplierId, onClose }: { supplierId: string | null; onClose: () => void }) {
  const suppliers = useDemandStore((s) => s.suppliers);
  const skus = useDemandStore((s) => s.skus);
  const pos = useDemandStore((s) => s.pos);

  const supplier = suppliers.find((s) => s.id === supplierId);
  const linked = useMemo(() => skus.filter((k) => k.supplierId === supplierId).sort((a, b) => b.sales4w - a.sales4w), [skus, supplierId]);
  const history = useMemo(() => pos.filter((p) => p.supplierId === supplierId), [pos, supplierId]);
  const outstanding = history.filter((p) => p.payment !== "Paid").reduce((s, p) => s + p.total, 0);
  const lifetime = history.reduce((s, p) => s + p.total, 0);

  if (!supplier) return null;

  return (
    <Sheet open onClose={onClose} title={supplier.name} description={`${supplier.id} · ${supplier.category}`} className="max-w-3xl">
      <div className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">On-time delivery</p>
            <div className="mt-2">
              <OnTime pct={supplier.onTimePct} />
            </div>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Outstanding payables</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-amber-300">{formatInr(outstanding)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">PO value logged</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">{formatInr(lifetime)}</p>
          </Card>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Profile</h3>
          <Card className="divide-y divide-zinc-800/70 text-sm">
            <Row icon={Building2} label="Primary contact">
              {supplier.contact}
            </Row>
            <Row icon={Mail} label="Email">
              <a href={`mailto:${supplier.email}`} className="text-indigo-300 hover:underline">
                {supplier.email}
              </a>
            </Row>
            <Row icon={Phone} label="Phone">
              <a href={`tel:${supplier.phone.replace(/\s/g, "")}`} className="hover:text-indigo-300">
                {supplier.phone}
              </a>
            </Row>
            <Row icon={MapPin} label="Location">
              {supplier.city}
            </Row>
            <Row icon={FileText} label="Payment terms">
              <Badge tone={supplier.paymentTerms === "Advance" ? "amber" : "neutral"}>{supplier.paymentTerms}</Badge>
            </Row>
          </Card>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Active contract</h3>
          <Card className="p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-indigo-300">{supplier.contract.id}</span>
              <Badge tone="emerald" dot>
                Active
              </Badge>
            </div>
            <p className="mt-1.5 text-zinc-300">{supplier.contract.scope}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {formatDate(supplier.contract.start)} to {formatDate(supplier.contract.end)}
            </p>
          </Card>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Linked SKUs ({linked.length})</h3>
          <Card className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-800/60">
                {linked.slice(0, 40).map((k) => (
                  <tr key={k.id}>
                    <td className="td font-mono text-xs text-zinc-500">{k.id}</td>
                    <td className="td truncate">{k.name}</td>
                    <td className="td text-right tabular-nums text-zinc-400">{formatNumber(k.sales4w)}/wk</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linked.length > 40 && <p className="px-3 py-2 text-xs text-zinc-500">and {linked.length - 40} more SKUs</p>}
          </Card>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Purchase order history ({history.length})</h3>
          <Card className="overflow-hidden">
            <PoTable pos={history} suppliers={suppliers} compact />
          </Card>
        </section>
      </div>
    </Sheet>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-zinc-600" />
      <span className="w-28 shrink-0 text-xs text-zinc-500">{label}</span>
      <span className="min-w-0 truncate text-zinc-200">{children}</span>
    </div>
  );
}
