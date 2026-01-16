-- Tax Rates (Tenant-level configuration)
-- Allow users to configure tax rates once and select from dropdown
-- Tax rates link to ledger accounts for automatic journal entry creation

create table if not exists tax_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null, -- e.g., "VAT 5%", "GST 10%"
  percentage numeric(5,2) not null check (percentage >= 0 and percentage <= 100),
  tax_type text not null check (tax_type in ('input', 'output')),
  output_vat_account_id uuid references chart_of_accounts(id) on delete restrict,
  input_vat_account_id uuid references chart_of_accounts(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, name) -- Tax rate names must be unique per tenant
);

-- Index for performance
create index if not exists idx_tax_rates_tenant_active on tax_rates(tenant_id, is_active);

-- RLS
alter table tax_rates enable row level security;

-- Drop existing policies if they exist (idempotent)
drop policy if exists "Users can view their tenant tax rates" on tax_rates;
drop policy if exists "Admins can manage their tenant tax rates" on tax_rates;

create policy "Users can view their tenant tax rates"
  on tax_rates for select using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Admins can manage their tenant tax rates"
  on tax_rates for all using (
    tenant_id in (
      select tenant_id from app_users 
      where auth_user_id = auth.uid() 
      and role in ('admin', 'accountant')
    )
  );
