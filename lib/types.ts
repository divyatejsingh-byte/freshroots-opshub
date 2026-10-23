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
}

export interface Distributor {
  id: string;
  name: string;
  region: string;
  active: boolean;
}

export type SkuStatus = "critical" | "overstock" | "healthy" | "nodata";

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
