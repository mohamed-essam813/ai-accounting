-- Fixed assets polish: source tracking, disposal metadata, transfers, view columns

-- Source of asset row (bills, manual, opening balance)
alter table public.fixed_assets
  add column if not exists source_type text not null default 'manual'
    check (source_type in ('vendor_bill', 'manual', 'opening_balance'));

-- Link to materialized bill when capitalized from a posted supplier bill
alter table public.fixed_assets
  add column if not exists source_bill_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fixed_assets_source_bill_id_fkey'
  ) then
    alter table public.fixed_assets
      add constraint fixed_assets_source_bill_id_fkey
      foreign key (source_bill_id) references public.bills (id) on delete set null;
  end if;
end $$;

-- Disposal journal + details (5.x)
alter table public.fixed_assets
  add column if not exists disposal_method text,
  add column if not exists disposal_reason text,
  add column if not exists disposal_notes text,
  add column if not exists disposal_recipient text,
  add column if not exists disposal_journal_entry_id uuid references public.journal_entries (id) on delete set null;

-- Backfill source_type from existing links
update public.fixed_assets
set
  source_type = case
    when source_journal_entry_id is not null then 'vendor_bill'
    else 'manual'
  end
where source_type = 'manual'
  and source_journal_entry_id is not null;

create index if not exists idx_fixed_assets_source_bill on public.fixed_assets (tenant_id, source_bill_id);
create index if not exists idx_fixed_assets_source_type on public.fixed_assets (tenant_id, source_type);

-- Transfers (no GL impact) — 6.x
create table if not exists public.fixed_asset_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  asset_id uuid not null references public.fixed_assets (id) on delete cascade,
  transfer_date date not null,
  to_location text,
  to_assigned_to text,
  from_location text,
  from_assigned_to text,
  reason text,
  notes text,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_fa_transfers_tenant on public.fixed_asset_transfers (tenant_id);
create index if not exists idx_fa_transfers_asset on public.fixed_asset_transfers (asset_id, created_at desc);

alter table public.fixed_asset_transfers enable row level security;

create policy "Users can view fixed asset transfers in their tenant"
  on public.fixed_asset_transfers for select
  using (
    tenant_id in (select tenant_id from public.app_users where auth_user_id = auth.uid())
  );

create policy "Users can insert fixed asset transfers in their tenant"
  on public.fixed_asset_transfers for insert
  with check (
    tenant_id in (select tenant_id from public.app_users where auth_user_id = auth.uid())
  );

-- Extended summary view: register list / filters
-- Cannot CREATE OR REPLACE when column 4+ change shape vs old (category was 4, now name/description/asset_code) — must drop.
drop view if exists public.v_fixed_assets_summary;

create view public.v_fixed_assets_summary as
select
  fa.tenant_id,
  fa.id as asset_id,
  fa.name,
  fa.description,
  fa.asset_code,
  fa.category,
  fa.cost,
  fa.useful_life_months,
  fa.residual_value,
  fa.depreciation_method,
  fa.purchase_date,
  fa.start_depreciation_date,
  fa.is_active,
  fa.disposed_at,
  fa.disposal_proceeds,
  fa.disposal_gain_loss,
  fa.location,
  fa.assigned_to,
  fa.source_type,
  fa.source_bill_id,
  fa.source_bill_line_id,
  fa.source_draft_id,
  fa.source_journal_entry_id,
  coalesce(max(ds.accumulated_depreciation), 0) as accumulated_depreciation,
  coalesce(max(ds.net_book_value), fa.cost) as net_book_value,
  case
    when fa.start_depreciation_date is not null and fa.is_active then
      (date_part('year', age(current_date, fa.start_depreciation_date::date)) * 12
        + date_part('month', age(current_date, fa.start_depreciation_date::date)))::integer
    else 0
  end as months_depreciated
from public.fixed_assets fa
left join public.depreciation_schedules ds on ds.asset_id = fa.id
group by
  fa.tenant_id,
  fa.id,
  fa.name,
  fa.description,
  fa.asset_code,
  fa.category,
  fa.cost,
  fa.useful_life_months,
  fa.residual_value,
  fa.depreciation_method,
  fa.purchase_date,
  fa.start_depreciation_date,
  fa.is_active,
  fa.disposed_at,
  fa.disposal_proceeds,
  fa.disposal_gain_loss,
  fa.location,
  fa.assigned_to,
  fa.source_type,
  fa.source_bill_id,
  fa.source_bill_line_id,
  fa.source_draft_id,
  fa.source_journal_entry_id;

grant select on public.v_fixed_assets_summary to authenticated;
