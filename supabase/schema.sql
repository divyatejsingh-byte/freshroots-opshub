-- Freshroots OpsHub schema. Run once in the Supabase SQL editor of the OpsHub project.
-- Row level security is on with no policies: only the service role key (server side) can read or write.

create table if not exists distributors (
  id        text primary key,
  name      text not null,
  region    text not null,
  active    boolean not null default true
);

create table if not exists skus (
  id             text primary key,
  name           text not null,
  category       text,                       -- null = missing in the source, raised as a data gap
  perishable     boolean,
  reorder_qty    integer,
  unit_of_measure text not null default 'Units',
  distributor_id text references distributors (id),
  unit_cost      numeric(12, 2),
  unit_price     numeric(12, 2),
  price_source   text
);

create table if not exists weekly_sales (
  sku_id     text not null references skus (id) on delete cascade,
  week       text not null,            -- ISO week, e.g. 2026-W42
  units_sold integer not null,
  primary key (sku_id, week)
);

create table if not exists inventory (
  sku_id        text not null references skus (id) on delete cascade,
  location      text not null,
  units_on_hand integer not null,
  as_of_date    date not null,
  primary key (sku_id, location)
);

create table if not exists calendar (
  year_month        text primary key,  -- 2026-10
  year              integer not null,
  month             integer not null,
  is_festival_month boolean not null
);

-- Human-entered values and confirmations that fill data gaps, with the reason recorded
create table if not exists data_fixes (
  sku_id    text not null references skus (id) on delete cascade,
  field     text not null,
  value     jsonb not null,
  note      text not null,
  source    text not null default 'planner',
  fixed_by  text,
  fixed_at  timestamptz not null default now(),
  primary key (sku_id, field)
);

-- Planner decisions made in the Demand Planning Studio
create table if not exists decisions (
  sku_id     text primary key references skus (id) on delete cascade,
  state      text not null check (state in ('pending', 'approved', 'paused', 'submitted')),
  qty        integer,
  reason     text,
  decided_by text,
  decided_at timestamptz not null default now()
);

-- Suppliers and purchase orders (sample data in the app until a vendor source exists)
create table if not exists suppliers (
  id            text primary key,
  name          text not null,
  category      text not null,
  contact       text,
  email         text,
  phone         text,
  payment_terms text
);

create table if not exists purchase_orders (
  po_number   text primary key,
  supplier_id text references suppliers (id),
  total       numeric(14, 2) not null,
  raised_date date not null,
  eta         date,
  payment     text not null,
  procurement text not null
);

create table if not exists po_lines (
  po_number text not null references purchase_orders (po_number) on delete cascade,
  sku_id    text not null references skus (id),
  qty       integer not null,
  unit_cost numeric(12, 2) not null,
  primary key (po_number, sku_id)
);

alter table distributors     enable row level security;
alter table skus             enable row level security;
alter table weekly_sales     enable row level security;
alter table inventory        enable row level security;
alter table calendar         enable row level security;
alter table decisions        enable row level security;
alter table data_fixes       enable row level security;
alter table suppliers        enable row level security;
alter table purchase_orders  enable row level security;
alter table po_lines         enable row level security;

-- The project is created with "automatically expose new tables" off, so grant the server role explicitly.
-- anon and authenticated get nothing: the browser never talks to these tables directly.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
