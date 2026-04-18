-- Company-level configuration (single row per tenant). Replaces ad hoc tenant columns for new features; tenants row kept for compatibility.

create table if not exists public.company_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,

  company_name text not null default '',
  trade_license_number text,
  logo_url text,
  registered_address text,
  home_emirate text,
  country text not null default 'AE',
  phone text,
  email text,
  website text,
  industry text,

  vat_registered boolean not null default false,
  trn text,
  vat_effective_date date,
  vat_filing_frequency text not null default 'quarterly',
  first_vat_period_start date,
  standard_vat_rate numeric(5,2) not null default 5,
  zero_rated_categories jsonb not null default '[]'::jsonb,
  exempt_categories jsonb not null default '[]'::jsonb,
  reverse_charge_enabled boolean not null default false,

  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  base_currency text not null default 'AED',
  currency_symbol_position text not null default 'prefix',
  currency_decimal_separator text not null default '.',
  currency_thousand_separator text not null default ',',

  inventory_valuation_method text not null default 'fifo',
  allow_negative_stock boolean not null default false,
  default_warehouse_id uuid,

  capitalization_threshold numeric(14,2) not null default 1000,
  default_depreciation_method text not null default 'straight_line',

  deferred_revenue_account_code text not null default '2300',
  month_end_recognition_day text not null default 'first_of_next',
  auto_run_month_end_recognition boolean not null default true,

  require_approval_before_posting boolean not null default false,
  minimum_approvers smallint not null default 1 check (minimum_approvers between 1 and 3),
  approval_amount_threshold numeric(14,2),
  auto_notify_drafter_on_approval boolean not null default true,

  default_comparison_period text not null default 'prior_period',
  default_date_range text not null default 'this_month',
  hide_rows_under_amount numeric(14,2) not null default 0,
  material_change_absolute numeric(14,2) not null default 1000,
  material_change_percentage numeric(5,2) not null default 20,
  default_pl_revenue_view text not null default 'recognized',
  show_gross_margin_percent boolean not null default true,
  show_net_margin_percent boolean not null default true,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.company_settings is 'Single row per tenant — consolidated company configuration (UAE defaults).';

create table if not exists public.useful_life_defaults (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category text not null,
  life_years smallint not null check (life_years > 0 and life_years <= 100),
  unique (tenant_id, category)
);

create index if not exists idx_useful_life_defaults_tenant on public.useful_life_defaults(tenant_id);

-- Backfill from tenants
insert into public.company_settings (
  tenant_id,
  company_name,
  registered_address,
  logo_url,
  country,
  trn,
  fiscal_year_start_month,
  base_currency
)
select
  t.id,
  coalesce(nullif(trim(t.legal_name), ''), t.name),
  t.address,
  t.logo_url,
  case when t.country is null or trim(t.country) = '' then 'AE' else trim(t.country) end,
  t.tax_registration_number,
  coalesce(t.fiscal_year_start_month, 1)::smallint,
  t.base_currency
from public.tenants t
on conflict (tenant_id) do nothing;

-- Default useful life rows per tenant
insert into public.useful_life_defaults (tenant_id, category, life_years)
select t.id, v.category, v.years::smallint
from public.tenants t
cross join (
  values
    ('Computers & IT', 3),
    ('Furniture & Fixtures', 5),
    ('Vehicles', 5),
    ('Office Equipment', 5),
    ('Machinery', 10),
    ('Buildings', 25)
) as v(category, years)
on conflict (tenant_id, category) do nothing;

-- Keep tenants.name / legal_name in sync when company_settings updates (handled in app); optional trigger could be added later.

alter table public.company_settings enable row level security;
alter table public.useful_life_defaults enable row level security;

create policy company_settings_select on public.company_settings
  for select using (tenant_id = public.get_current_user_tenant_id());

create policy company_settings_insert on public.company_settings
  for insert with check (tenant_id = public.get_current_user_tenant_id());

create policy company_settings_update on public.company_settings
  for update using (tenant_id = public.get_current_user_tenant_id());

create policy useful_life_defaults_all on public.useful_life_defaults
  for all using (tenant_id = public.get_current_user_tenant_id())
  with check (tenant_id = public.get_current_user_tenant_id());

create or replace function public.touch_company_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_company_settings_touch on public.company_settings;
create trigger trg_company_settings_touch
  before update on public.company_settings
  for each row execute function public.touch_company_settings_updated_at();
