-- Core schema for AI Accounting Platform
-- Enable pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- Tenants
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- Users (linked to auth.users for Supabase auth)
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'accountant', 'business_user', 'auditor')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, email)
);

-- Chart of Accounts
create table if not exists chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  code text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, code)
);

-- Journal Entries
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  date date not null,
  description text not null,
  status text not null check (status in ('draft', 'posted', 'void')),
  created_by uuid not null references app_users(id),
  approved_by uuid references app_users(id),
  created_at timestamptz not null default timezone('utc', now()),
  posted_at timestamptz
);

-- Journal Lines
create table if not exists journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references chart_of_accounts(id),
  memo text,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  constraint debcred_check check (
    (debit = 0 and credit > 0) or
    (credit = 0 and debit > 0)
  )
);

-- Prompt Drafts
create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  intent text not null,
  data_json jsonb not null,
  status text not null check (status in ('draft', 'approved', 'posted')),
  created_by uuid not null references app_users(id),
  approved_by uuid references app_users(id),
  confidence numeric(5,2),
  created_at timestamptz not null default timezone('utc', now()),
  approved_at timestamptz,
  posted_entry_id uuid references journal_entries(id)
);

-- Bank Transactions
create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  date date not null,
  amount numeric(18,2) not null,
  description text not null,
  counterparty text,
  status text not null check (status in ('unmatched', 'matched', 'excluded')),
  matched_entry_id uuid references journal_entries(id),
  source_file text,
  created_at timestamptz not null default timezone('utc', now())
);

-- Audit log
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_id uuid references app_users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  changes jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- Enforce double-entry balance using constraint trigger
create function ensure_balanced_journal() returns trigger as $$
declare
  total_debit numeric(18,2);
  total_credit numeric(18,2);
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into total_debit, total_credit
  from journal_lines
  where entry_id = new.entry_id;

  if total_debit <> total_credit then
    raise exception 'Journal entry % is not balanced. Debit: %, Credit: %', new.entry_id, total_debit, total_credit;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_journal_balance on journal_lines;
create constraint trigger trg_journal_balance
after insert or update or delete on journal_lines
deferrable initially deferred
for each row execute function ensure_balanced_journal();

-- Reporting views
create or replace view v_trial_balance as
  select
    je.tenant_id,
    ca.id as account_id,
    ca.code,
    ca.name,
    ca.type,
    sum(jl.debit) as total_debit,
    sum(jl.credit) as total_credit
  from journal_entries je
  join journal_lines jl on jl.entry_id = je.id
  join chart_of_accounts ca on ca.id = jl.account_id
  where je.status = 'posted'
  group by je.tenant_id, ca.id, ca.code, ca.name, ca.type;

create or replace view v_profit_and_loss as
  select
    tenant_id,
    sum(case when type = 'revenue' then total_credit - total_debit else 0 end) as total_revenue,
    sum(case when type = 'expense' then total_debit - total_credit else 0 end) as total_expense,
    sum(case when type = 'revenue' then total_credit - total_debit else 0 end) -
    sum(case when type = 'expense' then total_debit - total_credit else 0 end) as net_income
  from v_trial_balance
  group by tenant_id;

create or replace view v_balance_sheet as
  select
    tenant_id,
    sum(case when type = 'asset' then total_debit - total_credit else 0 end) as assets,
    sum(case when type = 'liability' then total_credit - total_debit else 0 end) as liabilities,
    sum(case when type = 'equity' then total_credit - total_debit else 0 end) as equity
  from v_trial_balance
  group by tenant_id;

-- Row Level Security
alter table tenants enable row level security;
alter table app_users enable row level security;
alter table chart_of_accounts enable row level security;
alter table journal_entries enable row level security;
alter table journal_lines enable row level security;
alter table drafts enable row level security;
alter table bank_transactions enable row level security;
alter table audit_logs enable row level security;

create policy "Users can view their tenant"
  on tenants for select using (id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users manage their tenant members"
  on app_users for all using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  )) with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users manage accounts in tenant"
  on chart_of_accounts for all using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  )) with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users manage journal entries in tenant"
  on journal_entries for all using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  )) with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users manage journal lines via entries"
  on journal_lines for all using (
    entry_id in (
      select id from journal_entries
      where tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid())
    )
  ) with check (
    entry_id in (
      select id from journal_entries
      where tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid())
    )
  );

create policy "Users manage drafts in tenant"
  on drafts for all using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  )) with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users manage bank transactions in tenant"
  on bank_transactions for all using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  )) with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users view audit logs in tenant"
  on audit_logs for select using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users insert audit logs in tenant"
  on audit_logs for insert with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

-- Helper function to record audit events
create or replace function fn_log_audit(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_changes jsonb
) returns void as $$
begin
  insert into audit_logs (tenant_id, actor_id, action, entity, entity_id, changes)
  values (p_tenant_id, p_actor_id, p_action, p_entity, p_entity_id, p_changes);
end;
$$ language plpgsql security definer;

