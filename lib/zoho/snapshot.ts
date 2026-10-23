import "server-only";
import { zohoGet, zohoOrgId, zohoPaged } from "./client";
import type { ZohoSkuRow, ZohoSnapshot } from "./types";

interface ZohoItem {
  item_id: string;
  name?: string;
  sku?: string;
  status?: string;
  rate?: number | string;
  purchase_rate?: number | string;
  stock_on_hand?: number | string | null;
  vendor_name?: string;
}

interface ZohoPoListRow {
  purchaseorder_id: string;
  purchaseorder_number?: string;
  status?: string;
}

interface ZohoPoLine {
  item_id: string;
  quantity?: number | string;
  quantity_received?: number | string;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

/** POs that are confirmed and may still have goods on the way */
const OUTSTANDING = new Set(["open", "issued", "partially_received", "partially received"]);
/** POs that cannot have goods on the way */
const NOT_OUTSTANDING = new Set(["draft", "cancelled", "canceled", "closed", "received", "fully_received", "fully received"]);

/**
 * Reads Zoho Inventory and reports what it says about the app's SKUs. Nothing is inferred:
 * - SKUs match only on an exact SKU code. No fuzzy or name matching.
 * - A value Zoho does not return (or returns as 0 or negative where that makes no sense) is left null and warned about.
 * - Open PO quantity is only reported when every purchase order has a status we understand.
 */
export async function buildSnapshot(appSkuIds: string[]): Promise<ZohoSnapshot> {
  const warnings: string[] = [];
  const items = await zohoPaged<ZohoItem>("/items", "items");

  const byCode = new Map<string, ZohoItem>();
  const duplicates = new Set<string>();
  for (const it of items) {
    const code = norm(it.sku);
    if (!code) continue;
    if (byCode.has(code)) duplicates.add(it.sku ?? code);
    else byCode.set(code, it);
  }
  if (duplicates.size) warnings.push(`Zoho has more than one item with the SKU code ${[...duplicates].join(", ")}. The first was used; please clean this up in Zoho.`);

  const wanted = appSkuIds.map((id) => ({ id, item: byCode.get(norm(id)) }));
  const missingInZoho = wanted.filter((w) => !w.item).map((w) => w.id);
  const matchedItems = wanted.filter((w): w is { id: string; item: ZohoItem } => !!w.item);

  // Purchase orders: outstanding quantity per Zoho item
  const poList = await zohoPaged<ZohoPoListRow>("/purchaseorders", "purchaseorders");
  const unknownStatuses = new Set<string>();
  const counted: ZohoPoListRow[] = [];
  for (const po of poList) {
    const s = norm(po.status);
    if (OUTSTANDING.has(s)) counted.push(po);
    else if (!NOT_OUTSTANDING.has(s)) unknownStatuses.add(po.status ?? "(none)");
  }

  let outstandingByItem: Map<string, number> | null = null;
  if (unknownStatuses.size) {
    warnings.push(`Open PO quantities were not imported: Zoho has purchase orders with status "${[...unknownStatuses].join('", "')}" and I will not guess whether goods are still arriving. Enter them on the Data Gaps page.`);
  } else {
    outstandingByItem = new Map();
    for (const po of counted) {
      const detail = await zohoGet<{ purchaseorder?: { line_items?: ZohoPoLine[] } }>(`/purchaseorders/${po.purchaseorder_id}`);
      for (const line of detail.purchaseorder?.line_items ?? []) {
        const ordered = num(line.quantity) ?? 0;
        const received = num(line.quantity_received) ?? 0;
        outstandingByItem.set(line.item_id, (outstandingByItem.get(line.item_id) ?? 0) + Math.max(0, ordered - received));
      }
    }
  }

  const matched: ZohoSkuRow[] = [];
  for (const { id, item } of matchedItems) {
    let stock = num(item.stock_on_hand);
    if (stock === null) {
      // Some list responses omit stock: ask for the single item before giving up
      const detail = await zohoGet<{ item?: ZohoItem }>(`/items/${item.item_id}`);
      stock = num(detail.item?.stock_on_hand);
    }
    if (stock === null) warnings.push(`${id}: Zoho returned no stock on hand for this item.`);
    else if (stock < 0) {
      warnings.push(`${id}: Zoho shows negative stock (${stock}). Not imported: fix it in Zoho or enter the real figure here.`);
      stock = null;
    }

    let unitCost = num(item.purchase_rate);
    if (unitCost !== null && unitCost <= 0) {
      warnings.push(`${id}: purchase rate is ${unitCost} in Zoho, so it is treated as not set.`);
      unitCost = null;
    }
    let unitPrice = num(item.rate);
    if (unitPrice !== null && unitPrice <= 0) {
      warnings.push(`${id}: selling rate is ${unitPrice} in Zoho, so it is treated as not set.`);
      unitPrice = null;
    }
    if (norm(item.status) && norm(item.status) !== "active") warnings.push(`${id}: the item is ${item.status} in Zoho.`);

    matched.push({
      skuId: id,
      zohoItemId: item.item_id,
      status: item.status ?? "",
      stock,
      unitCost,
      unitPrice,
      // Zoho has no outstanding lines for this item = 0 units on the way (a fact from the system of record)
      openPO: outstandingByItem ? (outstandingByItem.get(item.item_id) ?? 0) : null,
      vendorName: item.vendor_name?.trim() || null,
    });
  }

  const matchedCodes = new Set(matchedItems.map((m) => norm(m.id)));
  return {
    fetchedAt: new Date().toISOString(),
    orgId: zohoOrgId(),
    matched,
    missingInZoho,
    zohoItemsTotal: items.length,
    unmatchedZohoItems: items.filter((i) => !matchedCodes.has(norm(i.sku))).length,
    purchaseOrdersCounted: counted.length,
    warnings,
  };
}
