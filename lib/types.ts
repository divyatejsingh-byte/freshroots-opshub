export type Category = "Beverage" | "Snack" | "Staple" | "Dairy Alt" | "Condiment";

/** Festival uplift is set per category */
export type Segment = Category;

export type SupplierCategory = "Raw Ingredients" | "Packaging Material" | "Spices" | "Oil/Ghee";

export interface Sku {
  id: string;
  name: string;
  category: Category;
  segment: Segment;
  perishable: boolean;
  packSize: string;
  /** Landed cost per unit, ₹ */
  unitCost: number;
  /** Distributor price per unit, ₹ */
  unitPrice: number;
  /** Units per case; orders round up to a case */
  caseSize: number;
  stock: number;
  openPO: number;
  /** Average weekly units, trailing 4 weeks */
  sales4w: number;
  /** Average weekly units, trailing 12 weeks */
  sales12w: number;
  /** Week-on-week coefficient of variation of sales */
  volatility: number;
  distributorId: string;
  /** The distributor carrying this SKU is no longer active */
  distributorDrop: boolean;
  supplierId: string;
  /** Unresolved data gaps. Numeric fields above hold 0 where data is missing and must not be read while a gap exists. */
  gaps: DataGap[];
}

/**
 * A field a person can supply or correct. Sales weeks are "sales:<ISO week>".
 * avg4w and avg12w override the weekly series (used by imports).
 */
export type FixField =
  | "unitCost"
  | "unitPrice"
  | "stock"
  | "openPO"
  | "supplierId"
  | "caseSize"
  | "perishable"
  | "category"
  | "distributorId"
  | "avg4w"
  | "avg12w"
  | `sales:${string}`;

/** blocking: no recommendation is produced. ordering: recommendation shows, approval is blocked. warning: informational. */
export type GapSeverity = "blocking" | "ordering" | "warning";

export interface DataGap {
  skuId: string;
  field: FixField;
  severity: GapSeverity;
  label: string;
  detail: string;
}

/** A human-entered value (or confirmation) for a gap, with the reason recorded */
export interface DataFix {
  skuId: string;
  field: FixField;
  /** number, string or boolean; "exclude" on a sales week drops that week from the averages */
  value: number | string | boolean;
  note: string;
  source: "planner" | "import";
  at: string;
}

/** What the files actually contain: null means the value is not in the source */
export interface RawSku {
  id: string;
  name: string;
  category: string | null;
  perishable: boolean | null;
  reorderQty: number | null;
  distributorId: string | null;
  unitCost: number | null;
  unitPrice: number | null;
  stock: number | null;
  stockAsOf: string | null;
  openPO: number | null;
  supplierId: string | null;
  /** Only the weeks present in the source */
  weekly: Record<string, number>;
}

export interface GlobalGap {
  id: string;
  severity: GapSeverity;
  label: string;
  detail: string;
}

export interface Distributor {
  id: string;
  name: string;
  region: string;
  active: boolean;
}

export type SkuStatus = "critical" | "overstock" | "healthy" | "nodata" | "blocked";

export type EdgeReason = "zero-baseline" | "high-volatility" | "distributor-drop";

export interface Analysis {
  sku: Sku;
  /** Weekly units used as velocity (4-week average, 12-week as fallback) */
  velocity: number;
  weeksOfCover: number;
  status: SkuStatus;
  stockoutBelow: number;
  overstockAbove: number;
  surgePct: number;
  isSurge: boolean;
  multiplier: number;
  festivalUplift: number;
  edgeReasons: EdgeReason[];
  isEdge: boolean;
  /** Gaps that stop a recommendation */
  blockers: DataGap[];
  /** Gaps that stop approval but not the recommendation */
  orderGaps: DataGap[];
  /** Forecast weekly demand after festival uplift */
  forecastWeekly: number;
  recommendedQty: number;
}

export type DecisionState = "pending" | "approved" | "paused" | "submitted";

export interface Decision {
  state: DecisionState;
  /** Planner-entered order quantity; falls back to the recommendation */
  qty?: number;
  reason?: string;
  /** Quarterly saving locked in when the batch was submitted */
  saving?: number;
}

export interface FestivalConfig {
  active: boolean;
  /** False when the calendar has no row for the current month and nobody has chosen yet */
  confirmed: boolean;
  /** Percent uplift per affected segment */
  uplift: Partial<Record<Segment, number>>;
}

export interface Supplier {
  id: string;
  name: string;
  category: SupplierCategory;
  contact: string;
  email: string;
  phone: string;
  city: string;
  paymentTerms: "Net 30" | "Net 15" | "Advance";
  onTimePct: number;
  contract: { id: string; start: string; end: string; scope: string };
}

export type PaymentStatus = "Pending Approval" | "Approved" | "Paid" | "Overdue";
export type ProcurementStatus = "Draft" | "Sent" | "Shipped" | "Received";

export interface PoLine {
  skuId: string;
  name: string;
  qty: number;
  unitCost: number;
}

export interface PurchaseOrder {
  poNumber: string;
  supplierId: string;
  lines: PoLine[];
  total: number;
  raisedDate: string;
  eta: string;
  payment: PaymentStatus;
  procurement: ProcurementStatus;
  source: "forecast" | "history";
}
