-- Settlement + numbering + business document fields

-- ---------------------------------------------------------------------------
-- 1) Tenant branding fields for professional PDFs
-- ---------------------------------------------------------------------------
alter table tenants add column if not exists legal_name text;
alter table tenants add column if not exists address text;
alter table tenants add column if not exists logo_url text;
alter table tenants add column if not exists document_footer_text text;

comment on column tenants.legal_name is 'Legal company name used on PDFs.';
comment on column tenants.address is 'Company address for PDFs (free text).';
comment on column tenants.logo_url is 'Optional logo URL used in PDFs.';
comment on column tenants.document_footer_text is 'Optional footer text printed on vouchers.';

-- ---------------------------------------------------------------------------
-- 2) Document sequences (atomic, per tenant + type + fiscal year)
-- ---------------------------------------------------------------------------
create table if not exists document_sequences (
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_type text not null check (document_type in ('invoice','bill','payment','receipt')),
  fiscal_year int not null,
  next_number int not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, document_type, fiscal_year)
);

alter table document_sequences enable row level security;
drop policy if exists "Tenant members manage document sequences" on document_sequences;
create policy "Tenant members manage document sequences"
  on document_sequences for all
  using (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()));

create or replace function next_document_number(
  p_tenant_id uuid,
  p_document_type text,
  p_date date
) returns text as $$
declare
  v_year int := extract(year from p_date)::int;
  v_next int;
  v_prefix text;
begin
  if p_document_type not in ('invoice','bill','payment','receipt') then
    raise exception 'Invalid document_type: %', p_document_type;
  end if;

  insert into document_sequences(tenant_id, document_type, fiscal_year, next_number)
  values (p_tenant_id, p_document_type, v_year, 2)
  on conflict (tenant_id, document_type, fiscal_year)
  do update set
    next_number = document_sequences.next_number + 1,
    updated_at = timezone('utc', now())
  returning (case when xmax = 0 then 1 else document_sequences.next_number end) into v_next;

  v_prefix := case p_document_type
    when 'invoice' then 'INV'
    when 'bill' then 'BILL'
    when 'payment' then 'PAY'
    when 'receipt' then 'RCV'
  end;

  return v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 4, '0');
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 3) Settlement / allocations
-- ---------------------------------------------------------------------------
alter table invoices add column if not exists amount_received numeric(18,2) not null default 0;
alter table invoices add column if not exists outstanding_amount numeric(18,2) not null default 0;
alter table invoices add column if not exists settlement_status text not null default 'unpaid'
  check (settlement_status in ('unpaid','partial','paid'));

alter table bills add column if not exists amount_paid numeric(18,2) not null default 0;
alter table bills add column if not exists outstanding_amount numeric(18,2) not null default 0;
alter table bills add column if not exists settlement_status text not null default 'unpaid'
  check (settlement_status in ('unpaid','partial','paid'));

-- Add voucher numbers to payments rows (single table stores both receipts and payments)
alter table payments add column if not exists voucher_number text;

create unique index if not exists payments_tenant_voucher_number_key
  on payments(tenant_id, voucher_number)
  where voucher_number is not null;

-- Ensure invoices/bills numbers are unique per tenant (when present)
create unique index if not exists invoices_tenant_invoice_number_key
  on invoices(tenant_id, invoice_number)
  where invoice_number is not null;

create unique index if not exists bills_tenant_bill_number_key
  on bills(tenant_id, bill_number)
  where bill_number is not null;

create table if not exists receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  receipt_id uuid not null references payments(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  allocated_amount numeric(18,2) not null check (allocated_amount > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_receipt_allocations_receipt on receipt_allocations(receipt_id);
create index if not exists idx_receipt_allocations_invoice on receipt_allocations(invoice_id);

create table if not exists payment_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  payment_id uuid not null references payments(id) on delete cascade,
  bill_id uuid not null references bills(id) on delete cascade,
  allocated_amount numeric(18,2) not null check (allocated_amount > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_payment_allocations_payment on payment_allocations(payment_id);
create index if not exists idx_payment_allocations_bill on payment_allocations(bill_id);

alter table receipt_allocations enable row level security;
alter table payment_allocations enable row level security;

drop policy if exists "Tenant members manage receipt allocations" on receipt_allocations;
create policy "Tenant members manage receipt allocations"
  on receipt_allocations for all
  using (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()));

drop policy if exists "Tenant members manage payment allocations" on payment_allocations;
create policy "Tenant members manage payment allocations"
  on payment_allocations for all
  using (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()));

create or replace function recompute_invoice_settlement(p_invoice_id uuid) returns void as $$
declare
  v_total numeric(18,2);
  v_received numeric(18,2);
begin
  select total_amount into v_total from invoices where id = p_invoice_id;
  select coalesce(sum(allocated_amount), 0)::numeric(18,2) into v_received
    from receipt_allocations where invoice_id = p_invoice_id;

  update invoices set
    amount_received = v_received,
    outstanding_amount = greatest(v_total - v_received, 0)::numeric(18,2),
    settlement_status = case
      when v_received <= 0 then 'unpaid'
      when v_received + 0.005 < v_total then 'partial'
      else 'paid'
    end
  where id = p_invoice_id;
end;
$$ language plpgsql security definer;

create or replace function recompute_bill_settlement(p_bill_id uuid) returns void as $$
declare
  v_total numeric(18,2);
  v_paid numeric(18,2);
begin
  select total_amount into v_total from bills where id = p_bill_id;
  select coalesce(sum(allocated_amount), 0)::numeric(18,2) into v_paid
    from payment_allocations where bill_id = p_bill_id;

  update bills set
    amount_paid = v_paid,
    outstanding_amount = greatest(v_total - v_paid, 0)::numeric(18,2),
    settlement_status = case
      when v_paid <= 0 then 'unpaid'
      when v_paid + 0.005 < v_total then 'partial'
      else 'paid'
    end
  where id = p_bill_id;
end;
$$ language plpgsql security definer;

create or replace function trg_receipt_allocations_recompute() returns trigger as $$
begin
  perform recompute_invoice_settlement(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists receipt_allocations_recompute on receipt_allocations;
create trigger receipt_allocations_recompute
after insert or update or delete on receipt_allocations
for each row execute function trg_receipt_allocations_recompute();

create or replace function trg_payment_allocations_recompute() returns trigger as $$
begin
  perform recompute_bill_settlement(coalesce(new.bill_id, old.bill_id));
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists payment_allocations_recompute on payment_allocations;
create trigger payment_allocations_recompute
after insert or update or delete on payment_allocations
for each row execute function trg_payment_allocations_recompute();

-- Backfill outstanding for existing rows (best-effort)
update invoices set
  outstanding_amount = greatest(total_amount - amount_received, 0)::numeric(18,2)
where outstanding_amount = 0;

update bills set
  outstanding_amount = greatest(total_amount - amount_paid, 0)::numeric(18,2)
where outstanding_amount = 0;

