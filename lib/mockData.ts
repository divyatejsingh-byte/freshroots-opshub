import type { PaymentStatus, ProcurementStatus, PurchaseOrder, Sku, Supplier, SupplierCategory } from "./types";
import { addDays, isoDate } from "./utils";

/**
 * Sample data: the uploaded files contain no supplier master or PO history,
 * so suppliers and past POs are generated. SKUs come from lib/data/load.ts.
 * Deterministic PRNG so a given seed always yields the same dataset.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const between = (r: Rng, lo: number, hi: number) => lo + (hi - lo) * r();
const pick = <T,>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

const SUPPLIER_SEED: { name: string; category: SupplierCategory; city: string; contact: string; domain: string }[] = [
  { name: "Sahyadri Agro Flours", category: "Raw Ingredients", city: "Kolhapur", contact: "Prakash Jadhav", domain: "sahyadriagro.in" },
  { name: "Vidarbha Besan & Pulses", category: "Raw Ingredients", city: "Nagpur", contact: "Snehal Deshmukh", domain: "vidarbhapulses.co.in" },
  { name: "Deccan Grain Traders", category: "Raw Ingredients", city: "Pune", contact: "Mahesh Kulkarni", domain: "deccangrain.in" },
  { name: "Konkan Sugar & Jaggery Co.", category: "Raw Ingredients", city: "Ratnagiri", contact: "Sunil Sawant", domain: "konkanjaggery.com" },
  { name: "Marathwada Millets", category: "Raw Ingredients", city: "Latur", contact: "Anjali Pawar", domain: "marathwadamillets.in" },
  { name: "Goan Coconut Produce", category: "Raw Ingredients", city: "Margao", contact: "Joaquim Fernandes", domain: "goancoconut.in" },
  { name: "Nashik Potato Dehydrates", category: "Raw Ingredients", city: "Nashik", contact: "Vikas Gaikwad", domain: "nashikdehydrates.com" },
  { name: "Khandesh Peanut Mills", category: "Raw Ingredients", city: "Jalgaon", contact: "Rekha Patil", domain: "khandeshpeanut.in" },
  { name: "Konkan Packaging Solutions", category: "Packaging Material", city: "Thane", contact: "Nitin Naik", domain: "konkanpack.com" },
  { name: "Pune FlexiPack Industries", category: "Packaging Material", city: "Pune", contact: "Meera Joshi", domain: "puneflexipack.in" },
  { name: "Aurangabad Laminates", category: "Packaging Material", city: "Chhatrapati Sambhajinagar", contact: "Faisal Shaikh", domain: "aurangabadlaminates.co.in" },
  { name: "Ghatkopar Carton Works", category: "Packaging Material", city: "Mumbai", contact: "Hitesh Mehta", domain: "ghatkoparcarton.com" },
  { name: "Bardez Pouch & Film", category: "Packaging Material", city: "Mapusa", contact: "Savio D'Souza", domain: "bardezpouch.in" },
  { name: "Western Ghats Polymers", category: "Packaging Material", city: "Nashik", contact: "Pooja Bhosale", domain: "wgpolymers.in" },
  { name: "Malabar Spices Co.", category: "Spices", city: "Kochi", contact: "Thomas Mathew", domain: "malabarspices.co.in" },
  { name: "Sangli Turmeric & Chilli", category: "Spices", city: "Sangli", contact: "Rajesh Mane", domain: "sangliturmeric.in" },
  { name: "Guntur Mirchi Exports", category: "Spices", city: "Guntur", contact: "Lakshmi Reddy", domain: "gunturmirchi.com" },
  { name: "Khandesh Masala House", category: "Spices", city: "Dhule", contact: "Sachin Thakare", domain: "khandeshmasala.in" },
  { name: "Mapusa Spice Blenders", category: "Spices", city: "Mapusa", contact: "Agnelo Pereira", domain: "mapusaspice.in" },
  { name: "Vidarbha Oil Mills", category: "Oil/Ghee", city: "Akola", contact: "Gajanan Wankhede", domain: "vidarbhaoil.in" },
  { name: "Latur Groundnut Oils", category: "Oil/Ghee", city: "Latur", contact: "Shubhangi Kale", domain: "laturoils.co.in" },
  { name: "Panchganga Ghee Producers", category: "Oil/Ghee", city: "Kolhapur", contact: "Dnyaneshwar Patil", domain: "panchgangaghee.in" },
  { name: "Satara Refined Oils", category: "Oil/Ghee", city: "Satara", contact: "Kavita Shinde", domain: "sataraoils.com" },
  { name: "Sindhudurg Coconut Oil Works", category: "Oil/Ghee", city: "Kudal", contact: "Amol Parab", domain: "sindhucoconutoil.in" },
];

const CONTRACT_SCOPE: Record<SupplierCategory, string> = {
  "Raw Ingredients": "Annual rate contract: graded raw ingredients, quality-certified lots",
  "Packaging Material": "Annual supply agreement: laminates, pouches and cartons, FSSAI-compliant",
  Spices: "Seasonal procurement contract: whole and ground spices, lab-tested",
  "Oil/Ghee": "Bulk tanker supply: refined oils and ghee, monthly price reset",
};

export function generateSuppliers(seed: number): Supplier[] {
  const r = mulberry32(seed + 7);
  return SUPPLIER_SEED.map((s, i) => {
    const [first, ...rest] = s.contact.split(" ");
    const last = (rest.join("") || first).toLowerCase().replace(/[^a-z]/g, "");
    const terms = pick(r, ["Net 30", "Net 30", "Net 15", "Advance"] as const);
    const year = 2025 + (i % 2);
    return {
      id: `SUP-${String(101 + i)}`,
      name: s.name,
      category: s.category,
      contact: s.contact,
      email: `${first.toLowerCase().replace(/[^a-z]/g, "")}.${last}@${s.domain}`,
      phone: `+91 ${pick(r, [98, 97, 99, 88, 77, 94])}${Math.floor(between(r, 100, 999))} ${Math.floor(between(r, 10000, 99999))}`,
      city: s.city,
      paymentTerms: terms,
      onTimePct: Math.round(between(r, 78, 99) * 10) / 10,
      contract: {
        id: `CT-${year}-${String(40 + i * 3).padStart(3, "0")}`,
        start: `${year}-${String(1 + (i % 12)).padStart(2, "0")}-01`,
        end: `${year + 1}-${String(1 + (i % 12)).padStart(2, "0")}-28`,
        scope: CONTRACT_SCOPE[s.category],
      },
    };
  });
}

export function generatePurchaseOrders(seed: number, suppliers: Supplier[], skus: Sku[]): PurchaseOrder[] {
  const r = mulberry32(seed + 31);
  const now = new Date();
  const bySupplier = new Map<string, Sku[]>();
  for (const s of skus) bySupplier.set(s.supplierId, [...(bySupplier.get(s.supplierId) ?? []), s]);

  const carriers = suppliers.filter((s) => bySupplier.has(s.id));
  const orders: PurchaseOrder[] = [];
  const count = 60;
  for (let n = 0; n < count; n++) {
    const supplier = pick(r, carriers);
    const linked = bySupplier.get(supplier.id);
    if (!linked?.length) continue;

    const lineCount = Math.min(linked.length, 2 + Math.floor(r() * 7));
    const used = new Set<number>();
    const lines = [];
    while (lines.length < lineCount) {
      const idx = Math.floor(r() * linked.length);
      if (used.has(idx)) continue;
      used.add(idx);
      const sku = linked[idx];
      const cases = 1 + Math.floor(r() * 4);
      lines.push({ skuId: sku.id, name: sku.name, qty: cases * sku.caseSize, unitCost: sku.unitCost });
    }
    const total = Math.round(lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0));

    const age = Math.floor(between(r, 1, 98));
    const raised = addDays(now, -age);
    const eta = addDays(raised, Math.floor(between(r, 7, 19)));

    let procurement: ProcurementStatus;
    if (age > 30) procurement = "Received";
    else if (age > 18) procurement = r() < 0.6 ? "Received" : "Shipped";
    else if (age > 8) procurement = r() < 0.5 ? "Shipped" : "Sent";
    else procurement = r() < 0.4 ? "Draft" : "Sent";

    let payment: PaymentStatus;
    const roll = r();
    if (procurement === "Draft") payment = "Pending Approval";
    else if (procurement === "Received") {
      const dueDays = supplier.paymentTerms === "Net 15" ? 15 : supplier.paymentTerms === "Net 30" ? 30 : 0;
      if (age > dueDays + 25) payment = roll < 0.88 ? "Paid" : "Overdue";
      else if (age > dueDays) payment = roll < 0.55 ? "Paid" : roll < 0.8 ? "Approved" : "Overdue";
      else payment = roll < 0.5 ? "Approved" : "Pending Approval";
    } else payment = roll < 0.6 ? "Pending Approval" : "Approved";

    orders.push({
      poNumber: "",
      supplierId: supplier.id,
      lines,
      total,
      raisedDate: isoDate(raised),
      eta: isoDate(eta),
      payment,
      procurement,
      source: "history",
    });
  }

  orders.sort((a, b) => a.raisedDate.localeCompare(b.raisedDate));
  orders.forEach((o, i) => (o.poNumber = `PO-2026-${String(29 + i).padStart(3, "0")}`));
  return orders.reverse();
}
