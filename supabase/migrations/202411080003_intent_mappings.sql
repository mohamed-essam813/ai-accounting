create table if not exists intent_account_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  intent text not null,
  debit_account_id uuid not null references chart_of_accounts(id),
  credit_account_id uuid not null references chart_of_accounts(id),
  tax_debit_account_id uuid references chart_of_accounts(id),
  tax_credit_account_id uuid references chart_of_accounts(id),
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, intent)
);

alter table intent_account_mappings enable row level security;

create policy "Tenant members manage intent mappings"
  on intent_account_mappings
  for all
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ))
  with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

