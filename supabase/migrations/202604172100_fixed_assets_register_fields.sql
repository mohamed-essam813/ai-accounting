-- Add asset register fields: unique asset code, physical tracking columns,
-- bill line traceability, and additional depreciation methods.

-- 1. Asset code: unique per-tenant identifier in format FA-YYYY-NNNN
alter table fixed_assets
  add column if not exists asset_code text;

create unique index if not exists idx_fixed_assets_code
  on fixed_assets(tenant_id, asset_code)
  where asset_code is not null;

comment on column fixed_assets.asset_code is 'Human-readable asset code, e.g. FA-2026-0001, unique per tenant.';

-- 2. Physical tracking columns
alter table fixed_assets
  add column if not exists serial_number text,
  add column if not exists location text,
  add column if not exists assigned_to text;

comment on column fixed_assets.serial_number  is 'Manufacturer / supplier serial number.';
comment on column fixed_assets.location       is 'Physical location of the asset (office, warehouse, etc.).';
comment on column fixed_assets.assigned_to    is 'Employee or department responsible for the asset.';

-- 3. Link back to the specific bill line that created this asset row
alter table fixed_assets
  add column if not exists source_bill_line_id text;

comment on column fixed_assets.source_bill_line_id is 'UI bill line ID that produced this asset (for quantity-split traceability).';

-- 4. Expand depreciation_method to include units_of_production and none.
--    Drop the old constraint and add a new one with all four values.
alter table fixed_assets
  drop constraint if exists fixed_assets_depreciation_method_check;

alter table fixed_assets
  add constraint fixed_assets_depreciation_method_check
  check (depreciation_method in ('straight_line', 'reducing_balance', 'units_of_production', 'none'));

-- 5. Sequence for generating asset codes per tenant
--    Each tenant gets its own counter via a per-tenant row in asset_code_sequences.
create table if not exists asset_code_sequences (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  last_seq   integer not null default 0
);

-- Service-role only; no RLS needed (used only from server-side functions).
comment on table asset_code_sequences is 'Per-tenant sequence counter for FA-YYYY-NNNN asset codes.';

-- 6. Helper function: atomically reserve the next asset code for a tenant
create or replace function public.next_asset_code(p_tenant_id uuid, p_year int)
returns text
language plpgsql
security definer
as $$
declare
  v_seq integer;
begin
  insert into asset_code_sequences(tenant_id, last_seq)
  values (p_tenant_id, 1)
  on conflict (tenant_id) do update
    set last_seq = asset_code_sequences.last_seq + 1
  returning last_seq into v_seq;

  return 'FA-' || lpad(p_year::text, 4, '0') || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

grant execute on function public.next_asset_code(uuid, int) to service_role;
