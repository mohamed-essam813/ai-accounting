-- Contacts overhaul: multi-role flags, UAE fields, soft deactivate, no hard delete,
-- improved code generation, subledger trigger by role, pg_trgm for duplicate detection.

create extension if not exists pg_trgm;

-- New columns (roles + lifecycle + UAE + banking)
alter table public.contacts
  add column if not exists is_customer boolean,
  add column if not exists is_vendor boolean,
  add column if not exists is_employee boolean;

update public.contacts set is_customer = (type = 'customer') where is_customer is null;
update public.contacts set is_vendor = (type = 'vendor') where is_vendor is null;
update public.contacts set is_employee = (type = 'other') where is_employee is null;

alter table public.contacts
  alter column is_customer set default false,
  alter column is_vendor set default false,
  alter column is_employee set default false;
alter table public.contacts
  alter column is_customer set not null,
  alter column is_vendor set not null,
  alter column is_employee set not null;

alter table public.contacts
  add column if not exists emirate text,
  add column if not exists tax_registration_country text not null default 'AE',
  add column if not exists is_vat_registered boolean not null default false,
  add column if not exists credit_limit numeric(14,2),
  add column if not exists payment_terms_days integer,
  add column if not exists default_revenue_account text,
  add column if not exists payable_terms_days integer,
  add column if not exists default_expense_account text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_name text,
  add column if not exists iban text,
  add column if not exists swift_code text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists notes text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.app_users(id) on delete set null,
  add column if not exists deactivation_reason text,
  add column if not exists deactivation_override_reason text,
  add column if not exists duplicate_warning_acknowledged boolean not null default false,
  add column if not exists trn text;

-- Migrate tax_id → trn then drop tax_id
update public.contacts set trn = tax_id where trn is null and tax_id is not null;
alter table public.contacts drop column if exists tax_id;

alter table public.contacts drop column if exists type;

alter table public.contacts drop constraint if exists contacts_at_least_one_role;
alter table public.contacts
  add constraint contacts_at_least_one_role
  check (is_customer or is_vendor or is_employee);

-- Code generation: max numeric suffix per prefix (CUST-, SUP-, EMP-, CONT-), gaps not reused
-- Second parameter must stay named p_type: Postgres forbids renaming parameters on CREATE OR REPLACE
-- (replaces generate_contact_code(uuid, text) from 202411080011; value is now a prefix string, not contact.type)
create or replace function public.generate_contact_code(p_tenant_id uuid, p_type text)
returns text as $$
declare
  max_n integer := 0;
  rec record;
  n integer;
  prefix text := upper(trim(p_type));
begin
  if prefix is null or prefix = '' then
    prefix := 'CONT';
  end if;

  for rec in
    select code
    from public.contacts
    where tenant_id = p_tenant_id
      and code ~ ('^' || prefix || '-[0-9]+$')
  loop
    begin
      n := cast(substring(rec.code from prefix || '-([0-9]+)$') as integer);
      if n > max_n then
        max_n := n;
      end if;
    exception when others then
      null;
    end;
  end loop;

  return prefix || '-' || lpad((max_n + 1)::text, 3, '0');
end;
$$ language plpgsql;

create or replace function public.set_contact_code()
returns trigger as $$
declare
  prefix text;
begin
  if new.code is not null and trim(new.code) <> '' then
    new.updated_at := timezone('utc', now());
    return new;
  end if;

  prefix := case
    when new.is_customer and new.is_vendor then 'CONT'
    when new.is_customer then 'CUST'
    when new.is_vendor then 'SUP'
    when new.is_employee then 'EMP'
    else 'CONT'
  end;

  new.code := public.generate_contact_code(new.tenant_id, prefix);
  new.updated_at := timezone('utc', now());
  return new;
end;
$$ language plpgsql;

-- Subledgers for any contact that gains customer/vendor role
create or replace function public.ensure_subledgers_for_contact()
returns trigger as $$
declare
  ar_account_id uuid;
  ap_account_id uuid;
begin
  if new.is_customer then
    select id into ar_account_id
    from public.chart_of_accounts
    where tenant_id = new.tenant_id
      and code = '1100'
      and type = 'asset'
    limit 1;

    if ar_account_id is not null then
      insert into public.subledgers (tenant_id, contact_id, gl_account_id, subledger_type)
      values (new.tenant_id, new.id, ar_account_id, 'ar')
      on conflict (tenant_id, contact_id, gl_account_id) do nothing;
    end if;
  end if;

  if new.is_vendor then
    select id into ap_account_id
    from public.chart_of_accounts
    where tenant_id = new.tenant_id
      and code = '2000'
      and type = 'liability'
    limit 1;

    if ap_account_id is not null then
      insert into public.subledgers (tenant_id, contact_id, gl_account_id, subledger_type)
      values (new.tenant_id, new.id, ap_account_id, 'ap')
      on conflict (tenant_id, contact_id, gl_account_id) do nothing;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_create_subledger_for_contact on public.contacts;
create trigger trg_create_subledger_for_contact
  after insert on public.contacts
  for each row execute function public.ensure_subledgers_for_contact();

drop trigger if exists trg_ensure_subledger_contact_update on public.contacts;
create trigger trg_ensure_subledger_contact_update
  after update of is_customer, is_vendor on public.contacts
  for each row
  when (old.is_customer is distinct from new.is_customer or old.is_vendor is distinct from new.is_vendor)
  execute function public.ensure_subledgers_for_contact();

-- Remove hard delete policy
drop policy if exists "Tenant members can delete contacts" on public.contacts;

-- Search indexes
create index if not exists idx_contacts_tenant_active on public.contacts(tenant_id, is_active);
create index if not exists idx_contacts_name_trgm on public.contacts using gin (name gin_trgm_ops);
create index if not exists idx_contacts_email_lower on public.contacts(tenant_id, lower(email));
create index if not exists idx_contacts_phone on public.contacts(tenant_id, phone);

comment on column public.contacts.bank_account_number is 'Stored as plain text; encrypt at rest in production if required.';

-- Atomic merge (server-side); called with tenant check in app
create or replace function public.merge_contacts_into(
  p_tenant_id uuid,
  p_keep_id uuid,
  p_merge_id uuid,
  p_note text
)
returns void as $$
declare
  s record;
begin
  if p_tenant_id is distinct from public.get_current_user_tenant_id() then
    raise exception 'forbidden';
  end if;

  if p_keep_id = p_merge_id then
    raise exception 'merge targets must differ';
  end if;

  perform 1 from public.contacts c
  where c.id = p_keep_id and c.tenant_id = p_tenant_id and c.is_active = true;
  if not found then raise exception 'keep contact not found or inactive'; end if;

  perform 1 from public.contacts c
  where c.id = p_merge_id and c.tenant_id = p_tenant_id and c.is_active = true;
  if not found then raise exception 'merge contact not found or inactive'; end if;

  update public.invoices set customer_id = p_keep_id where tenant_id = p_tenant_id and customer_id = p_merge_id;
  update public.bills set supplier_id = p_keep_id where tenant_id = p_tenant_id and supplier_id = p_merge_id;
  update public.payments set contact_id = p_keep_id where tenant_id = p_tenant_id and contact_id = p_merge_id;
  update public.drafts set contact_id = p_keep_id where tenant_id = p_tenant_id and contact_id = p_merge_id;
  update public.journal_entries set contact_id = p_keep_id where tenant_id = p_tenant_id and contact_id = p_merge_id;
  update public.journal_lines jl
  set contact_id = p_keep_id
  from public.journal_entries je
  where jl.entry_id = je.id
    and je.tenant_id = p_tenant_id
    and jl.contact_id = p_merge_id;

  -- Merge subledgers: sum balances when same (tenant, gl_account)
  for s in
    select id, gl_account_id, subledger_type, balance
    from public.subledgers
    where tenant_id = p_tenant_id and contact_id = p_merge_id
  loop
    insert into public.subledgers (tenant_id, contact_id, gl_account_id, subledger_type, balance)
    values (p_tenant_id, p_keep_id, s.gl_account_id, s.subledger_type, s.balance)
    on conflict (tenant_id, contact_id, gl_account_id)
    do update set
      balance = public.subledgers.balance + excluded.balance,
      updated_at = timezone('utc', now());
  end loop;

  delete from public.subledgers where tenant_id = p_tenant_id and contact_id = p_merge_id;

  update public.contacts
  set
    is_active = false,
    deactivated_at = timezone('utc', now()),
    deactivation_reason = coalesce(p_note, 'Merged into ' || (select code from public.contacts c2 where c2.id = p_keep_id)),
    updated_at = timezone('utc', now())
  where id = p_merge_id and tenant_id = p_tenant_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.merge_contacts_into(uuid, uuid, uuid, text) to authenticated;
comment on function public.merge_contacts_into is 'Merges merge contact into keep; restricted to caller tenant via get_current_user_tenant_id.';
