-- CoA fields for unified IFRS-style reporting (P&L + Balance Sheet grouping)

alter table public.chart_of_accounts
  add column if not exists reporting_category_type text,
  add column if not exists pl_subcategory text,
  add column if not exists coa_display_order integer not null default 0;

-- IFRS / management reporting top-level group (P&L + balance sheet)
alter table public.chart_of_accounts
  drop constraint if exists chart_of_accounts_reporting_category_type_check;

alter table public.chart_of_accounts
  add constraint chart_of_accounts_reporting_category_type_check
  check (
    reporting_category_type is null
    or reporting_category_type in (
      'Revenue',
      'Cost of Sales',
      'Operating Expenses',
      'Other Income',
      'Other Expenses',
      'Current Assets',
      'Non-current Assets',
      'Current Liabilities',
      'Non-current Liabilities',
      'Equity'
    )
  );

comment on column public.chart_of_accounts.reporting_category_type is 'IFRS-style report section for hierarchical financial statements.';
comment on column public.chart_of_accounts.pl_subcategory is 'Optional sub-bucket under Operating Expenses (or other) for P&L grouping.';
comment on column public.chart_of_accounts.coa_display_order is 'Sort order within a reporting group (lower first).';

create index if not exists idx_coa_tenant_reporting_cat
  on public.chart_of_accounts (tenant_id, reporting_category_type);

-- Backfill from type + account_classification
update public.chart_of_accounts
set
  reporting_category_type = case
    when type = 'revenue' and account_classification = 'other_income' then 'Other Income'
    when type = 'revenue' then 'Revenue'
    when type = 'expense' and (coalesce(is_cogs, false) or account_classification = 'cost_of_sales') then 'Cost of Sales'
    when type = 'expense' and account_classification = 'other_expense' then 'Other Expenses'
    when type = 'expense' and account_classification = 'other_income' then 'Other Income'
    when type = 'expense' and account_classification in ('operating_expense', 'operating_expenses') then 'Operating Expenses'
    when type = 'expense' then 'Operating Expenses'
    when type = 'asset' and (balance_sheet_role ilike '%current%' or detail_type ilike '%current%') then 'Current Assets'
    when type = 'asset' then 'Non-current Assets'
    when type = 'liability' and (balance_sheet_role ilike '%current%' or detail_type ilike '%current%') then 'Current Liabilities'
    when type = 'liability' then 'Non-current Liabilities'
    when type = 'equity' then 'Equity'
  end
where reporting_category_type is null;

-- Operating expense label from reporting_subgroup when pl_subcategory empty
update public.chart_of_accounts
set pl_subcategory = nullif(trim(coalesce(reporting_subgroup, reporting_group, '')), '')
where pl_subcategory is null and (reporting_subgroup is not null or reporting_group is not null);

comment on column public.chart_of_accounts.pl_subcategory is 'P&L sub-group label; may mirror reporting_subgroup when set.';
