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

1. Create a Supabase project, then run `supabase/schema.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
3. `npm run seed:supabase` loads the CSVs into the tables.

The app does not read from Supabase yet; it still loads from `data/`. Tables for decisions, suppliers and POs are ready for that switch.

## Notifications and cron

`vercel.json` schedules `/api/cron/dispatch-updates` at `30 1 * * 2,4` UTC (07:00 IST, Tue and Thu). Configuration is in `.env.example`.
