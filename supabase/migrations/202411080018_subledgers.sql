-- Subledgers: Link contacts to GL accounts for proper subledger tracking
-- Customers → Accounts Receivable (1100)
-- Suppliers → Accounts Payable (2000)

create table if not exists subledgers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  gl_account_id uuid not null references chart_of_accounts(id) on delete restrict,
  subledger_type text not null check (subledger_type in ('ar', 'ap')),
  balance numeric(18,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, contact_id, gl_account_id)
);

-- Index for performance
create index if not exists idx_subledgers_tenant_contact on subledgers(tenant_id, contact_id);
create index if not exists idx_subledgers_tenant_gl_account on subledgers(tenant_id, gl_account_id);
create index if not exists idx_subledgers_type on subledgers(subledger_type);

-- Function to auto-create subledger when contact is created
create or replace function create_subledger_for_contact() returns trigger as $$
declare
  ar_account_id uuid;
  ap_account_id uuid;
begin
  -- Find AR account (1100) for customers
  if new.type = 'customer' then
    select id into ar_account_id
    from chart_of_accounts
    where tenant_id = new.tenant_id
      and code = '1100'
      and type = 'asset'
    limit 1;
    
    if ar_account_id is not null then
      insert into subledgers (tenant_id, contact_id, gl_account_id, subledger_type)
      values (new.tenant_id, new.id, ar_account_id, 'ar')
      on conflict (tenant_id, contact_id, gl_account_id) do nothing;
    end if;
  end if;
  
  -- Find AP account (2000) for vendors
  if new.type = 'vendor' then
    select id into ap_account_id
    from chart_of_accounts
    where tenant_id = new.tenant_id
      and code = '2000'
      and type = 'liability'
    limit 1;
    
    if ap_account_id is not null then
      insert into subledgers (tenant_id, contact_id, gl_account_id, subledger_type)
      values (new.tenant_id, new.id, ap_account_id, 'ap')
      on conflict (tenant_id, contact_id, gl_account_id) do nothing;
    end if;
  end if;
  
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-create subledger when contact is created
drop trigger if exists trg_create_subledger_for_contact on contacts;
create trigger trg_create_subledger_for_contact
  after insert on contacts
  for each row execute function create_subledger_for_contact();

-- Add contact_id to drafts table
alter table drafts 
  add column if not exists contact_id uuid references contacts(id) on delete set null;

-- Add contact_id to journal_entries table
alter table journal_entries 
  add column if not exists contact_id uuid references contacts(id) on delete set null;

-- Index for performance
create index if not exists idx_drafts_contact_id on drafts(contact_id);
create index if not exists idx_journal_entries_contact_id on journal_entries(contact_id);

-- Row Level Security
alter table subledgers enable row level security;

create policy "Tenant members can view subledgers"
  on subledgers
  for select
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Tenant members can insert subledgers"
  on subledgers
  for insert
  with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Tenant members can update subledgers"
  on subledgers
  for update
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

