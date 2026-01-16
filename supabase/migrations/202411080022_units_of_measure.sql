-- Units of Measure (UOM) - Tenant-level configuration
-- Allow users to manage units like kg, litre, cm, m, etc.
-- Units are linked to inventory items

create table if not exists units_of_measure (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null, -- e.g., "kilogram", "litre", "centimeter"
  abbreviation text not null, -- e.g., "kg", "L", "cm"
  category text not null check (category in ('weight', 'volume', 'length', 'count', 'other')),
  is_active boolean not null default true,
  is_system boolean not null default false, -- For preseeded units (cannot be deleted)
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, abbreviation) -- Abbreviation must be unique per tenant
);

-- Index for performance
create index if not exists idx_uom_tenant_active on units_of_measure(tenant_id, is_active);

-- Preseed common units (system units cannot be deleted, only deactivated)
insert into units_of_measure (tenant_id, name, abbreviation, category, is_system, is_active)
select 
  t.id as tenant_id,
  pu.name,
  pu.abbreviation,
  pu.category,
  true as is_system,
  true as is_active
from (
  values
    ('unit', 'unit', 'count'),
    ('kilogram', 'kg', 'weight'),
    ('gram', 'g', 'weight'),
    ('tonne', 't', 'weight'),
    ('litre', 'L', 'volume'),
    ('millilitre', 'ml', 'volume'),
    ('centimeter', 'cm', 'length'),
    ('meter', 'm', 'length'),
    ('kilometer', 'km', 'length'),
    ('box', 'box', 'count'),
    ('pack', 'pack', 'count'),
    ('pallet', 'pallet', 'count')
) as pu(name, abbreviation, category)
cross join tenants t
where not exists (
  select 1 from units_of_measure uom 
  where uom.tenant_id = t.id 
  and uom.abbreviation = pu.abbreviation
);

-- Update inventory_items to reference UOM
-- First, check if uom_id column exists, if not add it
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'inventory_items' 
    and column_name = 'uom_id'
  ) then
    -- Add uom_id column
    alter table inventory_items 
    add column uom_id uuid references units_of_measure(id) on delete restrict;

    -- Migrate existing unit text values to UOM
    -- First, ensure default UOMs exist for all tenants
    -- Then, map existing unit values to UOMs
    update inventory_items
    set uom_id = (
      select uom.id
      from units_of_measure uom
      where uom.tenant_id = inventory_items.tenant_id
      and (
        lower(uom.abbreviation) = lower(inventory_items.unit)
        or lower(uom.name) = lower(inventory_items.unit)
      )
      limit 1
    )
    where uom_id is null;

    -- For items without matching UOM, create a default UOM or use 'unit'
    update inventory_items
    set uom_id = (
      select id
      from units_of_measure
      where tenant_id = inventory_items.tenant_id
      and abbreviation = 'unit'
      limit 1
    )
    where uom_id is null;

    -- Make uom_id not null after migration
    alter table inventory_items
    alter column uom_id set not null;
  end if;
end $$;

-- RLS
alter table units_of_measure enable row level security;

-- Drop existing policies if they exist (idempotent)
drop policy if exists "Users can view their tenant UOMs" on units_of_measure;
drop policy if exists "Admins can manage their tenant UOMs" on units_of_measure;

create policy "Users can view their tenant UOMs"
  on units_of_measure for select using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Admins can manage their tenant UOMs"
  on units_of_measure for all using (
    tenant_id in (
      select tenant_id from app_users 
      where auth_user_id = auth.uid() 
      and role in ('admin', 'accountant')
    )
  );
