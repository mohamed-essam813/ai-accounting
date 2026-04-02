-- Smart items: product/service classification, account mappings, search keywords

alter table inventory_items
  add column if not exists item_type text not null default 'product'
    check (item_type in ('product', 'service'));

alter table inventory_items
  add column if not exists inventory_tracked boolean not null default true;

alter table inventory_items
  add column if not exists revenue_account_id uuid references chart_of_accounts(id) on delete set null;

alter table inventory_items
  add column if not exists expense_account_id uuid references chart_of_accounts(id) on delete set null;

alter table inventory_items
  add column if not exists default_tax_rate_id uuid references tax_rates(id) on delete set null;

alter table inventory_items
  add column if not exists selling_price numeric(18, 4);

alter table inventory_items
  add column if not exists cost_price numeric(18, 4);

alter table inventory_items
  add column if not exists keywords text;

-- Existing rows: physical inventory products (defaults already applied; explicit backfill for safety)
update inventory_items set item_type = 'product', inventory_tracked = true;

create index if not exists idx_inventory_items_tenant_name_lower
  on inventory_items (tenant_id, lower(name));

comment on column inventory_items.item_type is 'product (stock-capable) vs service (revenue/expense only)';
comment on column inventory_items.inventory_tracked is 'When product: whether stock and COGS/inventory postings apply';
comment on column inventory_items.keywords is 'Optional comma-separated search terms';
