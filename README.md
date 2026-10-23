# Freshroots OpsHub

Bi-weekly demand planning and procurement workspace for Freshroots (Next.js 14, Tailwind, Zustand).

- **Demand Planning Studio** (`/demand-planning`): velocity, stockout/overstock, festival uplift, batch PO approval.
- **Supplier Desk** (`/suppliers`): vendor directory, raised POs, payment approvals.
- **Digest & Dispatch** (`/notifications`): Tuesday and Thursday 07:00 IST Slack and email digest, with previews and test sends.

## Run

```bash
npm install
npm run dev        # http://localhost:3100
```

## Data and data gaps

The app reads the CSVs in `data/` (`sku_master`, `weekly_sales`, `current_inventory`, `distributor_master`, `calendar`, `sku_prices`).
`npm run data` inlines them into `lib/data/raw.ts` (runs automatically on dev and build). Replace a file, then restart.

**Nothing is assumed.** Whatever the files do not contain is raised as a data gap and a person decides:

- **Blocking gaps** (no recommendation until resolved): missing stock, missing or incomplete sales weeks in the latest 12, open / in-transit POs not confirmed, missing reorder qty, perishability, category or distributor.
- **Ordering gaps** (recommendation shows, approval is blocked): unit cost, unit price, supplier not assigned.
- **Warnings**: stock snapshot older than 7 days, sales feed behind. **Dataset-wide**: the calendar has no row for the current month.

Resolve them on **Data Gaps** (`/data-gaps`): edit cells in the grid, add a reason, save. For a missing sales week you can enter units, confirm zero, or exclude the week from the averages. Every fix is stored with its reason (`data_fixes` table) and shown in a change log. SKUs on hold are left out of every KPI and the digest, and the digest raises the gaps.

`sku_prices.csv` is intentionally empty: costs and prices are not in the source files. The supplier list is sample data (no vendor master was provided), and no purchase history is invented.

## Supabase

Project: `freshroots-opshub` (ref `ibjlkvxpwjaiwuzucvjq`, Singapore). The schema and your CSV data are already loaded.

- **Reads:** with a key configured, the app loads SKUs, sales, stock and distributors from Supabase (header shows "Source: Supabase"). Without one it uses the bundled CSVs. If Supabase fails, it falls back and says so.
- **Writes:** planner approvals, pauses, overrides and quantities save to `decisions`, and data fixes with their reasons save to `data_fixes`. Both come back on reload. POs and suppliers are not persisted yet.
- **Server only:** the tables have row-level security on and no access for `anon` or `authenticated`. Only the secret key, used in route handlers (`app/api/dataset`), can read or write. It never reaches the browser.

To connect: in the Supabase dashboard open Project Settings, API Keys, copy the secret key, and set in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://ibjlkvxpwjaiwuzucvjq.supabase.co
SUPABASE_SECRET_KEY=<secret key>
```

Then restart `npm run dev`. To rebuild a database from scratch: run `supabase/schema.sql`, then `supabase/migrations/002_data_gaps.sql` is already folded into the schema; run `npm run seed:sql` and run the generated `supabase/seed.sql` (or `npm run seed:supabase` with the key set).

Access: the app has no sign-in. Anyone with the URL can view the data and change decisions and data fixes, because `/api/dataset` reads and writes Supabase with the secret key. Test sends of the digest are off in production (`ALLOW_MANUAL_DISPATCH`), and `/api/cron/*` requires `CRON_SECRET`.

## Zoho Inventory

Zoho Inventory is the system of record for stock, unit cost, unit price and open purchase orders. On **Data Gaps**, "Sync from Zoho" reads Zoho and fills those fields as fixes tagged `zoho`. Nothing is guessed:

- SKUs match on an **exact SKU code** only (the item's SKU field in Zoho must equal the app's SKU id, e.g. `SKU001`). Unmatched SKUs are listed.
- A value Zoho does not return, or returns as 0 / negative where that is meaningless, is skipped and warned about.
- **Open POs** = ordered minus received on purchase orders with status open, issued or partially received. If Zoho has a PO in a status the app does not recognise, no open-PO quantity is imported at all (you enter it by hand).
- Values you typed yourself are never overwritten by a sync. Supplier is never assigned from Zoho.

Connect it:

1. Create a Zoho Inventory account at zoho.com/inventory, using the data centre for your country (India = `.in`).
2. Find your **Organization ID**: Zoho Inventory, Settings, Organization Profile.
3. Open the API console for your data centre (https://api-console.zoho.in for India), choose **Add Client**, **Self Client**, and note the **Client ID** and **Client Secret**.
4. In the Self Client's **Generate Code** tab use scope `ZohoInventory.items.READ,ZohoInventory.purchaseorders.READ,ZohoInventory.settings.READ`, time duration 10 minutes, and click Create. Copy the code.
5. Within 10 minutes exchange it for a refresh token:
   ```
   curl -X POST "https://accounts.zoho.in/oauth/v2/token" -d grant_type=authorization_code -d client_id=<id> -d client_secret=<secret> -d code=<code>
   ```
   Keep the `refresh_token` from the response (it does not expire; the access token does, and the app refreshes it).
6. Set `ZOHO_DC`, `ZOHO_ORG_ID`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` in `.env.local` and in Vercel, then restart / redeploy.

Not built yet: pushing purchase orders to Zoho (needs the `ZohoInventory.purchaseorders.CREATE` scope and a real vendor list), and syncing vendors.

## Notifications and cron

`vercel.json` schedules `/api/cron/dispatch-updates` at `30 1 * * 2,4` UTC (07:00 IST, Tue and Thu). Configuration is in `.env.example`.
