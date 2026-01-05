-- Accounting Policies (Tenant-level configuration)
-- Inventory valuation method and other accounting policies

create table if not exists accounting_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  inventory_valuation_method text not null default 'fifo' check (inventory_valuation_method in ('fifo', 'weighted_average')),
  effective_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Audit log for policy changes
create table if not exists accounting_policy_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  policy_type text not null, -- e.g., 'inventory_valuation_method'
  previous_value text,
  new_value text not null,
  changed_by uuid not null references app_users(id),
  reason text not null, -- Mandatory reason for change
  effective_date date not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- Create default policy for existing tenants
insert into accounting_policies (tenant_id, inventory_valuation_method)
select id, 'fifo' from tenants
where id not in (select tenant_id from accounting_policies)
on conflict (tenant_id) do nothing;

-- RLS
alter table accounting_policies enable row level security;
alter table accounting_policy_changes enable row level security;

-- Drop existing policies if they exist (idempotent)
drop policy if exists "Users can view their tenant policies" on accounting_policies;
drop policy if exists "Admins can update their tenant policies" on accounting_policies;
drop policy if exists "Users can view their tenant policy changes" on accounting_policy_changes;
drop policy if exists "Admins can insert policy changes" on accounting_policy_changes;

create policy "Users can view their tenant policies"
  on accounting_policies for select using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Admins can update their tenant policies"
  on accounting_policies for update using (
    tenant_id in (
      select tenant_id from app_users 
      where auth_user_id = auth.uid() and role = 'admin'
    )
  );

create policy "Users can view their tenant policy changes"
  on accounting_policy_changes for select using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Admins can insert policy changes"
  on accounting_policy_changes for insert with check (
    tenant_id in (
      select tenant_id from app_users 
      where auth_user_id = auth.uid() and role = 'admin'
    )
  );

