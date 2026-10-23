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

## Data

The app reads the CSVs in `data/` (`sku_master`, `weekly_sales`, `current_inventory`, `distributor_master`, `calendar`, `sku_prices`).
`npm run data` inlines them into `lib/data/raw.ts` (runs automatically on dev and build). Replace a file, then restart.

- `data/sku_prices.csv` holds **placeholder** unit costs and prices (`Source = assumed`). Replace with real values.
- Suppliers and PO history are generated sample data: the source files have no vendor master.

## Supabase

Project: `freshroots-opshub` (ref `ibjlkvxpwjaiwuzucvjq`, Singapore). The schema and your CSV data are already loaded.

- **Reads:** with a key configured, the app loads SKUs, sales, stock and distributors from Supabase (header shows "Source: Supabase"). Without one it uses the bundled CSVs. If Supabase fails, it falls back and says so.
- **Writes:** planner approvals, pauses, overrides and quantities save to the `decisions` table and come back on reload. POs and suppliers are not persisted yet.
- **Server only:** the tables have row-level security on and no access for `anon` or `authenticated`. Only the secret key, used in route handlers (`app/api/dataset`), can read or write. It never reaches the browser.

To connect: in the Supabase dashboard open Project Settings, API Keys, copy the secret key, and set in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://ibjlkvxpwjaiwuzucvjq.supabase.co
SUPABASE_SECRET_KEY=<secret key>
```

Then restart `npm run dev`. To rebuild a database from scratch: run `supabase/schema.sql`, then `npm run seed:sql` and run the generated `supabase/seed.sql` (or `npm run seed:supabase` with the key set).

The app has no login yet. Add one before deploying publicly, because `/api/dataset` reads and writes with the secret key.

## Notifications and cron

`vercel.json` schedules `/api/cron/dispatch-updates` at `30 1 * * 2,4` UTC (07:00 IST, Tue and Thu). Configuration is in `.env.example`.
