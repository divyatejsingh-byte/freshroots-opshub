// Loads the CSVs in /data into the OpsHub Supabase project over the PostgREST API (no dependencies).
// Prerequisites: supabase/schema.sql has been run, and .env.local holds
//   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
//   SUPABASE_SECRET_KEY=<service role / secret key>
// Usage: npm run seed:supabase
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (existsSync(join(root, ".env.local"))) {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const read = (file) => parseCsv(readFileSync(join(root, "data", file), "utf8"));

async function upsert(table, rows, conflict) {
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST",
    headers: {
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  console.log(`${table}: ${rows.length} rows`);
}

const prices = new Map(read("sku_prices.csv").map((r) => [r.SKU_ID, r]));

// Order matters: parents before children (foreign keys)
await upsert(
  "distributors",
  read("distributor_master.csv").map((r) => ({ id: r.Distributor_ID, name: r.Distributor_Name, region: r.Region, active: r.Status.toLowerCase() === "active" })),
  "id"
);
await upsert(
  "skus",
  read("sku_master.csv").map((r) => ({
    id: r.SKU_ID,
    name: r.SKU_Name,
    category: r.Category,
    perishable: r.Perishability.toLowerCase() === "high" ? true : r.Perishability.toLowerCase() === "low" ? false : null,
    reorder_qty: r.Standard_Reorder_Qty === "" ? null : Number(r.Standard_Reorder_Qty),
    unit_of_measure: r.Unit_of_Measure,
    distributor_id: r.Distributor_ID,
    unit_cost: prices.get(r.SKU_ID)?.Unit_Cost ? Number(prices.get(r.SKU_ID).Unit_Cost) : null,
    unit_price: prices.get(r.SKU_ID)?.Unit_Price ? Number(prices.get(r.SKU_ID).Unit_Price) : null,
    price_source: prices.get(r.SKU_ID)?.Source || null,
  })),
  "id"
);
await upsert("weekly_sales", read("weekly_sales.csv").map((r) => ({ sku_id: r.SKU_ID, week: r.Week, units_sold: Number(r.Units_Sold) })), "sku_id,week");
await upsert(
  "inventory",
  read("current_inventory.csv").map((r) => ({ sku_id: r.SKU_ID, location: r.Location, units_on_hand: Number(r.Units_On_Hand), as_of_date: r.As_Of_Date })),
  "sku_id,location"
);
await upsert(
  "calendar",
  read("calendar.csv").map((r) => ({ year_month: r.Year_Month, year: Number(r.Year), month: Number(r.Month), is_festival_month: r.Is_Festival_Month.toUpperCase() === "TRUE" })),
  "year_month"
);
console.log("Done.");
