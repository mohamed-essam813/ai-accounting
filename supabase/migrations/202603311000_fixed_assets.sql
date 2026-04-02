-- Fixed Assets module (minimal schema for supplier bill asset purchases)

create table if not exists fixed_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  category text not null,
  purchase_value numeric(18, 2) not null,
  purchase_date date not null,
  useful_life_years integer not null check (useful_life_years > 0),
  depreciation_method text not null default 'straight_line' check (depreciation_method in ('straight_line')),
  accumulated_depreciation numeric(18, 2) not null default 0,
  net_book_value numeric(18, 2) not null,
  asset_account_id uuid references chart_of_accounts(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_fixed_assets_tenant on fixed_assets(tenant_id, purchase_date desc);

create table if not exists fixed_asset_depreciation_schedule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  asset_id uuid not null references fixed_assets(id) on delete cascade,
  period_start date not null,
  amount numeric(18, 2) not null,
  posted_entry_id uuid references journal_entries(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (asset_id, period_start)
);

create index if not exists idx_fixed_asset_sched_tenant_period on fixed_asset_depreciation_schedule(tenant_id, period_start desc);

