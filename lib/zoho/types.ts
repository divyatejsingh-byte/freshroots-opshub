/** One app SKU matched to a Zoho item. null means Zoho did not give a usable value: nothing is filled in. */
export interface ZohoSkuRow {
  skuId: string;
  zohoItemId: string;
  /** Zoho item status, e.g. active / inactive */
  status: string;
  stock: number | null;
  unitCost: number | null;
  unitPrice: number | null;
  /** Units ordered but not yet received, from Zoho purchase orders. null when it cannot be known reliably. */
  openPO: number | null;
  /** Preferred vendor name in Zoho. Shown for reference only: the supplier is never assigned from it. */
  vendorName: string | null;
}

export interface ZohoSnapshot {
  fetchedAt: string;
  orgId: string;
  matched: ZohoSkuRow[];
  /** App SKU ids with no item of that SKU code in Zoho */
  missingInZoho: string[];
  zohoItemsTotal: number;
  unmatchedZohoItems: number;
  purchaseOrdersCounted: number;
  warnings: string[];
}

export interface ZohoStatus {
  configured: boolean;
  missing?: string[];
  connected?: boolean;
  orgName?: string;
  dataCenter?: string;
  error?: string;
}
