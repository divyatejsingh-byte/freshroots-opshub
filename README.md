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

The app has no login yet. Add one before deploying publicly, because `/api/dataset` reads and writes with the secret key.

## Notifications and cron

`vercel.json` schedules `/api/cron/dispatch-updates` at `30 1 * * 2,4` UTC (07:00 IST, Tue and Thu). Configuration is in `.env.example`.
