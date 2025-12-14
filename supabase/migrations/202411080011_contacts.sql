-- Contacts table for customers, vendors, and others
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('customer', 'vendor', 'other')),
  email text,
  phone text,
  address text,
  tax_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, code)
);

-- Function to auto-generate contact codes
create or replace function generate_contact_code(
  p_tenant_id uuid,
  p_type text
) returns text as $$
declare
  prefix text;
  last_code text;
  next_num integer;
  new_code text;
begin
  -- Set prefix based on type
  case p_type
    when 'customer' then prefix := 'CUST';
    when 'vendor' then prefix := 'SUP';
    when 'other' then prefix := 'OTH';
    else prefix := 'CON';
  end case;

  -- Get the last code for this tenant and type
  select code into last_code
  from contacts
  where tenant_id = p_tenant_id
    and type = p_type
    and code ~ ('^' || prefix || '-[0-9]+$')
  order by code desc
  limit 1;

  -- Extract number and increment
  if last_code is null then
    next_num := 1;
  else
    next_num := cast(substring(last_code from '([0-9]+)$') as integer) + 1;
  end if;

  -- Format with leading zeros (e.g., CUST-001)
  new_code := prefix || '-' || lpad(next_num::text, 3, '0');

  return new_code;
end;
$$ language plpgsql;

-- Trigger to auto-generate code before insert
create or replace function set_contact_code() returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := generate_contact_code(new.tenant_id, new.type);
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_contact_code on contacts;
create trigger trg_set_contact_code
  before insert or update on contacts
  for each row execute function set_contact_code();

-- Row Level Security
alter table contacts enable row level security;

create policy "Tenant members can view contacts"
  on contacts
  for select
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Tenant members can insert contacts"
  on contacts
  for insert
  with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Tenant members can update contacts"
  on contacts
  for update
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Tenant members can delete contacts"
  on contacts
  for delete
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));
