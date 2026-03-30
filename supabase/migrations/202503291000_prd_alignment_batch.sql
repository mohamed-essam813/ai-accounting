-- PRD alignment batch: journal approval step, company setup fields, invoices/bills on post

-- ---------------------------------------------------------------------------
-- 1) Manual journals: draft → approved → posted
-- ---------------------------------------------------------------------------
alter table journal_entries drop constraint if exists journal_entries_status_check;
alter table journal_entries add constraint journal_entries_status_check
  check (status in ('draft', 'approved', 'posted', 'void'));

-- ---------------------------------------------------------------------------
-- 2) Tenant company setup (MVP schema)
-- ---------------------------------------------------------------------------
alter table tenants add column if not exists country text;
alter table tenants add column if not exists fiscal_year_start_month smallint
  check (fiscal_year_start_month is null or (fiscal_year_start_month >= 1 and fiscal_year_start_month <= 12));
alter table tenants add column if not exists tax_registration_number text;

comment on column tenants.country is 'ISO country name or code (free text).';
comment on column tenants.fiscal_year_start_month is '1–12: first month of fiscal year for reporting.';
comment on column tenants.tax_registration_number is 'VAT / tax ID for the company.';

-- ---------------------------------------------------------------------------
-- 3) Materialized invoices / bills (created when draft posts)
-- ---------------------------------------------------------------------------
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  draft_id uuid references drafts(id) on delete set null,
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  customer_id uuid references contacts(id) on delete set null,
  invoice_number text,
  invoice_date date not null,
  due_date date,
  currency_code text,
  subtotal numeric(18, 2) not null default 0,
  tax_amount numeric(18, 2) not null default 0,
  total_amount numeric(18, 2) not null default 0,
  status text not null default 'posted' check (status in ('draft', 'approved', 'posted')),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists invoices_journal_entry_id_key on invoices(journal_entry_id);
create index if not exists idx_invoices_tenant_date on invoices(tenant_id, invoice_date desc);

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid references inventory_items(id) on delete set null,
  description text,
  quantity numeric(18, 4) not null default 1,
  unit_price numeric(18, 2) not null default 0,
  tax_rate_id uuid references tax_rates(id) on delete set null,
  line_total numeric(18, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_invoice_items_invoice on invoice_items(invoice_id);

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  draft_id uuid references drafts(id) on delete set null,
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  supplier_id uuid references contacts(id) on delete set null,
  bill_number text,
  bill_date date not null,
  due_date date,
  currency_code text,
  subtotal numeric(18, 2) not null default 0,
  tax_amount numeric(18, 2) not null default 0,
  total_amount numeric(18, 2) not null default 0,
  status text not null default 'posted' check (status in ('draft', 'approved', 'posted')),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists bills_journal_entry_id_key on bills(journal_entry_id);
create index if not exists idx_bills_tenant_date on bills(tenant_id, bill_date desc);

create table if not exists bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  product_id uuid references inventory_items(id) on delete set null,
  description text,
  quantity numeric(18, 4) not null default 1,
  unit_cost numeric(18, 2) not null default 0,
  tax_rate_id uuid references tax_rates(id) on delete set null,
  line_total numeric(18, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_bill_items_bill on bill_items(bill_id);

alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table bills enable row level security;
alter table bill_items enable row level security;

drop policy if exists "Tenant members manage invoices" on invoices;
create policy "Tenant members manage invoices"
  on invoices for all
  using (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()));

drop policy if exists "Tenant members manage invoice items" on invoice_items;
create policy "Tenant members manage invoice items"
  on invoice_items for all
  using (
    exists (
      select 1 from invoices i
      where i.id = invoice_items.invoice_id
        and i.tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from invoices i
      where i.id = invoice_items.invoice_id
        and i.tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid())
    )
  );

drop policy if exists "Tenant members manage bills" on bills;
create policy "Tenant members manage bills"
  on bills for all
  using (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()));

drop policy if exists "Tenant members manage bill items" on bill_items;
create policy "Tenant members manage bill items"
  on bill_items for all
  using (
    exists (
      select 1 from bills b
      where b.id = bill_items.bill_id
        and b.tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from bills b
      where b.id = bill_items.bill_id
        and b.tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid())
    )
  );
