-- Fixed Assets & Depreciation Module (MVP)
-- MVP Feedback Section 8: Fixed Assets & Depreciation
-- MVP Feedback Section 9: Asset Disposal & Gain / Loss

-- Fixed Assets Register
create table if not exists fixed_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  category text not null, -- e.g., 'Vehicle', 'Equipment', 'Building', 'Furniture'
  cost numeric(18,2) not null, -- Original purchase cost
  useful_life_months integer not null, -- Useful life in months
  residual_value numeric(18,2) not null default 0, -- Expected value at end of useful life
  depreciation_method text not null check (depreciation_method in ('straight_line', 'reducing_balance')),
  -- Method locked once depreciation starts (enforced in application logic)
  purchase_date date not null,
  start_depreciation_date date, -- When depreciation starts (can be different from purchase date)
  is_active boolean not null default true,
  disposed_at date, -- If disposed, when
  disposal_proceeds numeric(18,2), -- If disposed, sale proceeds
  disposal_gain_loss numeric(18,2), -- Calculated gain/loss on disposal
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Depreciation Schedule (monthly depreciation records)
create table if not exists depreciation_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  asset_id uuid not null references fixed_assets(id) on delete cascade,
  period_start date not null, -- First day of depreciation period (month)
  period_end date not null, -- Last day of depreciation period (month)
  depreciation_amount numeric(18,2) not null, -- Depreciation for this period
  accumulated_depreciation numeric(18,2) not null, -- Total accumulated depreciation up to this period
  net_book_value numeric(18,2) not null, -- Cost - Accumulated Depreciation
  journal_entry_id uuid references journal_entries(id) on delete set null, -- Link to depreciation journal
  created_at timestamptz not null default timezone('utc', now()),
  unique (asset_id, period_start) -- One depreciation record per asset per period
);

-- Indexes
create index if not exists idx_fixed_assets_tenant on fixed_assets(tenant_id);
create index if not exists idx_fixed_assets_active on fixed_assets(tenant_id, is_active);
create index if not exists idx_depreciation_schedules_tenant on depreciation_schedules(tenant_id);
create index if not exists idx_depreciation_schedules_asset on depreciation_schedules(asset_id);
create index if not exists idx_depreciation_schedules_period on depreciation_schedules(period_start);

-- Row Level Security
alter table fixed_assets enable row level security;
alter table depreciation_schedules enable row level security;

create policy "Users can view fixed assets in their tenant"
  on fixed_assets for select
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users can manage fixed assets in their tenant"
  on fixed_assets for all
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users can view depreciation schedules in their tenant"
  on depreciation_schedules for select
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users can create depreciation schedules in their tenant"
  on depreciation_schedules for insert
  with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

-- View for fixed assets summary
create or replace view v_fixed_assets_summary as
  select
    fa.tenant_id,
    fa.id as asset_id,
    fa.name,
    fa.category,
    fa.cost,
    fa.useful_life_months,
    fa.residual_value,
    fa.depreciation_method,
    fa.purchase_date,
    fa.start_depreciation_date,
    fa.is_active,
    fa.disposed_at,
    fa.disposal_proceeds,
    fa.disposal_gain_loss,
    -- Get latest depreciation record
    coalesce(max(ds.accumulated_depreciation), 0) as accumulated_depreciation,
    coalesce(max(ds.net_book_value), fa.cost) as net_book_value,
    -- Calculate months depreciated
    case
      when fa.start_depreciation_date is not null and fa.is_active then
        extract(month from age(current_date, fa.start_depreciation_date))::integer
      else 0
    end as months_depreciated
  from fixed_assets fa
  left join depreciation_schedules ds on ds.asset_id = fa.id
  group by fa.tenant_id, fa.id, fa.name, fa.category, fa.cost, fa.useful_life_months,
           fa.residual_value, fa.depreciation_method, fa.purchase_date, fa.start_depreciation_date,
           fa.is_active, fa.disposed_at, fa.disposal_proceeds, fa.disposal_gain_loss;

grant select on v_fixed_assets_summary to authenticated;

-- Function to calculate monthly depreciation (Straight-Line)
-- Monthly depreciation = (Cost - Residual Value) / Useful Life in Months
create or replace function calculate_depreciation_straight_line(
  p_cost numeric,
  p_residual_value numeric,
  p_useful_life_months integer
) returns numeric as $$
begin
  if p_useful_life_months <= 0 then
    return 0;
  end if;
  
  return round((p_cost - p_residual_value) / p_useful_life_months, 2);
end;
$$ language plpgsql;

-- Function to calculate monthly depreciation (Reducing Balance / WDV)
-- Monthly depreciation = Net Book Value * Depreciation Rate
-- Depreciation Rate = 1 - (Residual Value / Cost)^(1 / Useful Life in Months)
create or replace function calculate_depreciation_reducing_balance(
  p_cost numeric,
  p_residual_value numeric,
  p_useful_life_months integer,
  p_current_nbv numeric -- Current Net Book Value
) returns numeric as $$
declare
  v_depreciation_rate numeric;
  v_monthly_depreciation numeric;
begin
  if p_useful_life_months <= 0 or p_current_nbv <= p_residual_value then
    return 0;
  end if;
  
  -- Calculate annual rate, then convert to monthly
  -- Rate = 1 - (Residual / Cost)^(1 / Years)
  -- Monthly rate = 1 - (Residual / Cost)^(1 / Months)
  if p_cost > 0 and p_residual_value < p_cost then
    v_depreciation_rate := 1 - power(p_residual_value / p_cost, 1.0 / p_useful_life_months);
  else
    v_depreciation_rate := 1.0 / p_useful_life_months; -- Fallback to straight-line equivalent
  end if;
  
  v_monthly_depreciation := p_current_nbv * v_depreciation_rate;
  
  -- Ensure we don't depreciate below residual value
  if (p_current_nbv - v_monthly_depreciation) < p_residual_value then
    v_monthly_depreciation := p_current_nbv - p_residual_value;
  end if;
  
  return round(greatest(v_monthly_depreciation, 0), 2);
end;
$$ language plpgsql;

