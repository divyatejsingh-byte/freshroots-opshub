import { Badge, type Tone } from "@/components/ui/badge";
import type { PaymentStatus, ProcurementStatus } from "@/lib/types";

const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  "Pending Approval": "amber",
  Approved: "indigo",
  Paid: "emerald",
  Overdue: "rose",
};

const PROCUREMENT_TONE: Record<ProcurementStatus, Tone> = {
  Draft: "neutral",
  Sent: "indigo",
  Shipped: "violet",
  Received: "emerald",
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={PAYMENT_TONE[status]} dot>
      {status}
    </Badge>
  );
}

export function ProcurementBadge({ status }: { status: ProcurementStatus }) {
  return <Badge tone={PROCUREMENT_TONE[status]}>{status}</Badge>;
}

export function OnTime({ pct }: { pct: number }) {
  const tone = pct >= 95 ? "text-emerald-300" : pct >= 88 ? "text-zinc-200" : "text-amber-300";
  return (
    <div className="flex items-center gap-2">
      <span className={`w-11 text-right text-xs font-medium tabular-nums ${tone}`}>{pct.toFixed(1)}%</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${pct >= 95 ? "bg-emerald-500" : pct >= 88 ? "bg-indigo-400" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
