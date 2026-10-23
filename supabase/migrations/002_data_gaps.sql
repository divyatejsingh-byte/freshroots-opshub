-- Data-gap gate: a missing value stays missing (null) instead of being defaulted, and human fixes keep an audit trail.

alter table skus alter column category    drop not null;
alter table skus alter column perishable  drop not null;
alter table skus alter column perishable  drop default;
alter table skus alter column reorder_qty drop not null;
alter table skus alter column reorder_qty drop default;
alter table skus alter column price_source drop not null;
alter table skus alter column price_source drop default;

-- Remove the placeholder prices: they were assumptions, not data
update skus set unit_cost = null, unit_price = null, price_source = null where price_source = 'assumed';

create table if not exists data_fixes (
  sku_id    text not null references skus (id) on delete cascade,
  field     text not null,              -- unitCost, openPO, supplierId, sales:2026-W35, ...
  value     jsonb not null,             -- number, string or boolean; "exclude" drops a sales week
  note      text not null,              -- why: where the value came from
  source    text not null default 'planner',
  fixed_by  text,
  fixed_at  timestamptz not null default now(),
  primary key (sku_id, field)
);

alter table data_fixes enable row level security;
grant all on data_fixes to service_role;
revoke all on data_fixes from anon, authenticated;
