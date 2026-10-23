export interface DigestSku {
  id: string;
  name: string;
  coverWeeks: number;
  weeklyVelocity: number;
  recommendedQty: number;
  orderValue: number;
  supplier: string;
  lostSales: number;
}

export interface Digest {
  generatedAt: string;
  /** "Tuesday" / "Thursday" on scheduled days, otherwise "Manual Test" */
  runLabel: string;
  dateLabel: string;
  totalSkus: number;
  critical: { count: number; lostSales: number };
  overstock: { count: number; tiedUpCapital: number };
  readyForApproval: { count: number; orderValue: number };
  festival: { active: boolean; name: string; upliftPct: number; segments: string[] };
  payables: { pendingApproval: number; pendingCount: number; overdue: number; overdueCount: number };
  topCritical: DigestSku[];
  workbenchUrl: string;
}

export type Channel = "slack" | "email";
export type DeliveryStatus = "sent" | "skipped" | "failed" | "preview";

export interface DeliveryResult {
  channel: Channel;
  status: DeliveryStatus;
  detail: string;
  at: string;
}

export interface DispatchLog {
  timestamp: string;
  trigger: "cron" | "manual";
  mode: "send" | "preview";
  delivery: DeliveryResult[];
  summary: Digest;
}
