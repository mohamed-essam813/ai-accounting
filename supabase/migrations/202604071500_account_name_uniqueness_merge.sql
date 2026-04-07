-- Case-insensitive + light singularization uniqueness for chart_of_accounts (per tenant).
-- 1) normalize_account_name_key() — must stay in sync with TS normalizeAccountUniquenessKey()
-- 2) Backfill normalized_name, merge duplicate active rows, remap FKs, delete merged rows
-- 3) BEFORE trigger keeps normalized_name aligned with name
-- 4) Partial unique index: one active account per (tenant_id, normalized_name)

create or replace function public.normalize_account_name_key(raw text)
returns text
language plpgsql
immutable
as $$
declare
  n text;
  parts text[];
  lw text;
  li int;
begin
  if raw is null then
    return '';
  end if;
  n := lower(trim(regexp_replace(raw, '\s+', ' ', 'g')));
  if n = '' then
    return '';
  end if;
  parts := string_to_array(n, ' ');
  li := array_length(parts, 1);
  lw := parts[li];
  if length(lw) > 3 and lw ~ 'ies$' then
    lw := regexp_replace(lw, 'ies$', 'y');
  elsif length(lw) > 3 and lw ~ 'sses$' then
    lw := regexp_replace(lw, 'sses$', 'ss');
  elsif length(lw) > 3 and right(lw, 1) = 's' and lw not like '%ss' then
    lw := left(lw, length(lw) - 1);
  end if;
  parts[li] := lw;
  return array_to_string(parts, ' ');
end;
$$;

comment on function public.normalize_account_name_key(text) is
  'Lowercase, trim, collapse spaces, light singularize last token; mirrors app normalizeAccountUniquenessKey.';

-- Keep normalized_name in sync (application also sends it; trigger is source of truth on name changes)
create or replace function public.chart_of_accounts_set_normalized_name()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := public.normalize_account_name_key(new.name);
  return new;
end;
$$;

drop trigger if exists trg_coa_set_normalized_name on public.chart_of_accounts;
create trigger trg_coa_set_normalized_name
before insert or update of name on public.chart_of_accounts
for each row
execute function public.chart_of_accounts_set_normalized_name();

-- Backfill all rows (trigger only runs on new/updated rows)
update public.chart_of_accounts
set normalized_name = public.normalize_account_name_key(name)
where normalized_name is distinct from public.normalize_account_name_key(name);

-- Merge duplicate *active* accounts per (tenant_id, normalized_name): keep system-standard + lowest code first
do $merge$
begin
  create temp table _coa_merge (from_id uuid primary key, to_id uuid not null) on commit drop;

  insert into _coa_merge (from_id, to_id)
  with ranked as (
    select
      id,
      first_value(id) over (
        partition by tenant_id, normalized_name
        order by is_system_standard desc, code asc
        rows between unbounded preceding and unbounded following
      ) as keeper_id,
      row_number() over (
        partition by tenant_id, normalized_name
        order by is_system_standard desc, code asc
      ) as rn
    from public.chart_of_accounts
    where is_active = true
      and normalized_name is not null
      and length(trim(normalized_name)) > 0
  )
  select id, keeper_id
  from ranked
  where rn > 1
    and id <> keeper_id;

  if exists (select 1 from _coa_merge limit 1) then
  update public.journal_lines jl
  set account_id = m.to_id
  from _coa_merge m
  where jl.account_id = m.from_id;

  update public.intent_account_mappings i
  set debit_account_id = m.to_id
  from _coa_merge m
  where i.debit_account_id = m.from_id;

  update public.intent_account_mappings i
  set credit_account_id = m.to_id
  from _coa_merge m
  where i.credit_account_id = m.from_id;

  update public.intent_account_mappings i
  set tax_debit_account_id = m.to_id
  from _coa_merge m
  where i.tax_debit_account_id = m.from_id;

  update public.intent_account_mappings i
  set tax_credit_account_id = m.to_id
  from _coa_merge m
  where i.tax_credit_account_id = m.from_id;

  update public.inventory_items ii
  set revenue_account_id = m.to_id
  from _coa_merge m
  where ii.revenue_account_id = m.from_id;

  update public.inventory_items ii
  set expense_account_id = m.to_id
  from _coa_merge m
  where ii.expense_account_id = m.from_id;

  update public.inventory_items ii
  set inventory_account_id = m.to_id
  from _coa_merge m
  where ii.inventory_account_id = m.from_id;

  update public.inventory_items ii
  set cogs_account_id = m.to_id
  from _coa_merge m
  where ii.cogs_account_id = m.from_id;

  update public.tax_rates tr
  set output_vat_account_id = m.to_id
  from _coa_merge m
  where tr.output_vat_account_id = m.from_id;

  update public.tax_rates tr
  set input_vat_account_id = m.to_id
  from _coa_merge m
  where tr.input_vat_account_id = m.from_id;

  update public.subledgers s
  set gl_account_id = m.to_id
  from _coa_merge m
  where s.gl_account_id = m.from_id;

  delete from public.subledgers s1
  using public.subledgers s2
  where s1.tenant_id = s2.tenant_id
    and s1.contact_id = s2.contact_id
    and s1.gl_account_id = s2.gl_account_id
    and s1.id > s2.id;

  update public.fixed_assets fa
  set asset_account_id = m.to_id
  from _coa_merge m
  where fa.asset_account_id = m.from_id;

  update public.payments p
  set bank_account_id = m.to_id
  from _coa_merge m
  where p.bank_account_id = m.from_id;

  update public.bank_transactions bt
  set bank_account_id = m.to_id
  from _coa_merge m
  where bt.bank_account_id = m.from_id;

  update public.chart_of_accounts c
  set parent_standard_account_id = m.to_id
  from _coa_merge m
  where c.parent_standard_account_id = m.from_id;

  delete from public.embeddings e
  using _coa_merge m
  where e.entity_type = 'account'
    and e.entity_id = m.from_id;

  delete from public.chart_of_accounts c
  using _coa_merge m
  where c.id = m.from_id;
  end if;
end
$merge$;

drop index if exists public.chart_of_accounts_tenant_normalized_name_active_uq;

create unique index chart_of_accounts_tenant_normalized_name_active_uq
  on public.chart_of_accounts (tenant_id, normalized_name)
  where is_active = true
    and normalized_name is not null
    and length(trim(normalized_name)) > 0;

comment on index public.chart_of_accounts_tenant_normalized_name_active_uq is
  'At most one active account per tenant for each normalized name key.';
