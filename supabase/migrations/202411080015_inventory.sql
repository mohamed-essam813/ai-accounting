-- Inventory Module (MVP)
-- MVP Feedback Section 7: Inventory (FIFO / Weighted Average)
-- Inventory is a Current Asset and represents trapped cash

-- Inventory Items
create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  sku text, -- Stock Keeping Unit
  description text,
  unit text not null default 'unit', -- e.g., 'piece', 'kg', 'liter'
  valuation_method text not null check (valuation_method in ('fifo', 'weighted_average')),
  -- Valuation method locked once transactions exist (enforced in application logic)
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, sku) -- SKU must be unique per tenant
);

-- Inventory Transactions (Purchases and Sales)
create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  item_id uuid not null references inventory_items(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('purchase', 'sale', 'adjustment', 'return')),
  date date not null,
  quantity numeric(18,4) not null, -- Can have decimal quantities (e.g., 1.5 kg)
  unit_cost numeric(18,2) not null, -- Cost per unit at time of transaction
  total_cost numeric(18,2) not null, -- quantity * unit_cost
  -- For FIFO: tracks which batch this belongs to
  batch_number integer, -- Sequential batch number for FIFO
  -- For sales: tracks COGS
  cogs_amount numeric(18,2), -- Cost of Goods Sold for this transaction
  -- Link to journal entry
  journal_entry_id uuid references journal_entries(id) on delete set null,
  -- Link to draft (if created from prompt)
  draft_id uuid references drafts(id) on delete set null,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

-- Inventory Balances (Current stock levels)
create table if not exists inventory_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  item_id uuid not null references inventory_items(id) on delete cascade,
  quantity numeric(18,4) not null default 0,
  -- For FIFO: tracks batches
  -- For Weighted Average: tracks average cost
  average_cost numeric(18,2), -- For weighted average method
  total_value numeric(18,2) not null default 0, -- Current inventory value
  last_transaction_date date,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, item_id)
);

-- Inventory Ageing (MVP Feedback: Inventory ageing tracked)
create table if not exists inventory_ageing (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  item_id uuid not null references inventory_items(id) on delete cascade,
  batch_number integer, -- For FIFO: which batch
  purchase_date date not null,
  quantity numeric(18,4) not null,
  unit_cost numeric(18,2) not null,
  total_value numeric(18,2) not null,
  days_in_stock integer not null, -- Age of inventory
  ageing_bucket text not null check (ageing_bucket in ('0-30', '31-60', '61-90', '90+')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Indexes for performance
create index if not exists idx_inventory_items_tenant on inventory_items(tenant_id);
create index if not exists idx_inventory_items_sku on inventory_items(tenant_id, sku);
create index if not exists idx_inventory_transactions_tenant on inventory_transactions(tenant_id);
create index if not exists idx_inventory_transactions_item on inventory_transactions(item_id);
create index if not exists idx_inventory_transactions_date on inventory_transactions(date);
create index if not exists idx_inventory_transactions_type on inventory_transactions(transaction_type);
create index if not exists idx_inventory_transactions_journal on inventory_transactions(journal_entry_id);
create index if not exists idx_inventory_balances_tenant on inventory_balances(tenant_id);
create index if not exists idx_inventory_balances_item on inventory_balances(item_id);
create index if not exists idx_inventory_ageing_tenant on inventory_ageing(tenant_id);
create index if not exists idx_inventory_ageing_item on inventory_ageing(item_id);
create index if not exists idx_inventory_ageing_bucket on inventory_ageing(ageing_bucket);

-- Row Level Security
alter table inventory_items enable row level security;
alter table inventory_transactions enable row level security;
alter table inventory_balances enable row level security;
alter table inventory_ageing enable row level security;

create policy "Users can view inventory in their tenant"
  on inventory_items for select
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users can manage inventory in their tenant"
  on inventory_items for all
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users can view inventory transactions in their tenant"
  on inventory_transactions for select
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users can create inventory transactions in their tenant"
  on inventory_transactions for insert
  with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users can view inventory balances in their tenant"
  on inventory_balances for select
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users can view inventory ageing in their tenant"
  on inventory_ageing for select
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

-- View for inventory summary
create or replace view v_inventory_summary as
  select
    ib.tenant_id,
    ib.item_id,
    ii.name as item_name,
    ii.sku,
    ii.valuation_method,
    ib.quantity,
    ib.average_cost,
    ib.total_value,
    ib.last_transaction_date,
    -- Calculate ageing breakdown
    coalesce(sum(case when ia.ageing_bucket = '0-30' then ia.quantity else 0 end), 0) as quantity_0_30,
    coalesce(sum(case when ia.ageing_bucket = '31-60' then ia.quantity else 0 end), 0) as quantity_31_60,
    coalesce(sum(case when ia.ageing_bucket = '61-90' then ia.quantity else 0 end), 0) as quantity_61_90,
    coalesce(sum(case when ia.ageing_bucket = '90+' then ia.quantity else 0 end), 0) as quantity_90_plus
  from inventory_balances ib
  join inventory_items ii on ii.id = ib.item_id
  left join inventory_ageing ia on ia.item_id = ib.item_id and ia.tenant_id = ib.tenant_id
  group by ib.tenant_id, ib.item_id, ii.name, ii.sku, ii.valuation_method, ib.quantity, ib.average_cost, ib.total_value, ib.last_transaction_date;

grant select on v_inventory_summary to authenticated;

-- Function to calculate COGS for a sale (FIFO method)
-- This will be called when a sale transaction is created
create or replace function calculate_cogs_fifo(
  p_tenant_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_date date
) returns numeric as $$
declare
  v_cogs numeric(18,2) := 0;
  v_remaining_quantity numeric(18,4) := p_quantity;
  v_batch_quantity numeric(18,4);
  v_batch_cost numeric(18,2);
  v_batch_record record;
begin
  -- Get batches in FIFO order (oldest first)
  for v_batch_record in
    select batch_number, quantity, unit_cost, total_value
    from inventory_ageing
    where tenant_id = p_tenant_id
      and item_id = p_item_id
      and quantity > 0
    order by purchase_date asc, batch_number asc
  loop
    if v_remaining_quantity <= 0 then
      exit;
    end if;

    v_batch_quantity := least(v_remaining_quantity, v_batch_record.quantity);
    v_batch_cost := v_batch_quantity * v_batch_record.unit_cost;
    v_cogs := v_cogs + v_batch_cost;
    v_remaining_quantity := v_remaining_quantity - v_batch_quantity;

    -- Update ageing record (reduce quantity)
    update inventory_ageing
    set quantity = quantity - v_batch_quantity,
        total_value = total_value - v_batch_cost,
        updated_at = timezone('utc', now())
    where tenant_id = p_tenant_id
      and item_id = p_item_id
      and batch_number = v_batch_record.batch_number;
  end loop;

  return v_cogs;
end;
$$ language plpgsql;

-- Function to calculate COGS for a sale (Weighted Average method)
create or replace function calculate_cogs_weighted_average(
  p_tenant_id uuid,
  p_item_id uuid,
  p_quantity numeric
) returns numeric as $$
declare
  v_average_cost numeric(18,2);
  v_cogs numeric(18,2);
begin
  -- Get current average cost from inventory_balances
  select average_cost into v_average_cost
  from inventory_balances
  where tenant_id = p_tenant_id
    and item_id = p_item_id;

  if v_average_cost is null then
    return 0;
  end if;

  v_cogs := p_quantity * v_average_cost;
  return v_cogs;
end;
$$ language plpgsql;

-- Function to update inventory ageing (update days_in_stock and ageing_bucket)
create or replace function update_inventory_ageing(
  p_tenant_id uuid
) returns void as $$
begin
  update inventory_ageing
  set
    days_in_stock = current_date - purchase_date,
    ageing_bucket = case
      when (current_date - purchase_date) <= 30 then '0-30'
      when (current_date - purchase_date) <= 60 then '31-60'
      when (current_date - purchase_date) <= 90 then '61-90'
      else '90+'
    end,
    updated_at = timezone('utc', now())
  where tenant_id = p_tenant_id
    and quantity > 0;
end;
$$ language plpgsql;

