-- Auto-standardized Chart of Accounts: reporting layer, keywords, trial balance view.

-- ---------------------------------------------------------------------------
-- chart_of_accounts: standardization & unified reporting classification
-- ---------------------------------------------------------------------------
alter table chart_of_accounts
  add column if not exists standardized_name text;

alter table chart_of_accounts
  add column if not exists normalized_name text;

alter table chart_of_accounts
  add column if not exists reporting_group text;

alter table chart_of_accounts
  add column if not exists reporting_subgroup text;

alter table chart_of_accounts
  add column if not exists is_system_standard boolean not null default false;

alter table chart_of_accounts
  add column if not exists is_custom boolean not null default true;

alter table chart_of_accounts
  add column if not exists parent_standard_account_id uuid references chart_of_accounts(id) on delete set null;

alter table chart_of_accounts
  add column if not exists reporting_classification text;

comment on column chart_of_accounts.standardized_name is
  'Canonical label for reporting (may differ from user-facing name).';
comment on column chart_of_accounts.normalized_name is
  'Lowercase trimmed name for deduplication and synonym matching.';
comment on column chart_of_accounts.reporting_classification is
  'Unified classification for statements: BS + P&L + tax; drives reports without name heuristics.';
comment on column chart_of_accounts.is_system_standard is
  'True for tenant seed / template accounts that define the standard structure.';
comment on column chart_of_accounts.is_custom is
  'False for seeded standard accounts; true for user-created accounts.';

-- Backfill normalized_name
update chart_of_accounts
set normalized_name = lower(trim(regexp_replace(name, '\s+', ' ', 'g')))
where normalized_name is null;

update chart_of_accounts
set standardized_name = name
where standardized_name is null;

-- Mark existing rows that match default codes as system standard (template CoA)
update chart_of_accounts
set is_system_standard = true,
    is_custom = false
where code in (
  '1000','1010','1100','1150','1200','1300','1350','1400',
  '1500','1600','1700','1800',
  '2000','2100','2150','2200','2300','2400','2500','2600','2650',
  '3000','3100','3200','3300',
  '4000','4100','4200',
  '5000','5100','5150','5200','5300','5350','5400','5450','5500','5520','5530','5550','5600','5650','5700','5800','5900'
);

-- reporting_classification backfill (do not rely on name alone for future rows; this is one-time migration)
update chart_of_accounts set reporting_classification = 'equity' where type = 'equity' and reporting_classification is null;

update chart_of_accounts
set reporting_classification = case
  when type = 'asset' and (category = 'non_current' or (category is null and code ~ '^[0-9]+$' and code::int >= 1500 and code::int < 2000)) then 'asset_non_current'
  when type = 'asset' then 'asset_current'
  else reporting_classification
end
where type = 'asset' and reporting_classification is null;

update chart_of_accounts
set reporting_classification = case
  when type = 'liability' and (category = 'non_current' or (category is null and code ~ '^[0-9]+$' and code::int >= 2500)) then 'liability_non_current'
  when type = 'liability' then 'liability_current'
  else reporting_classification
end
where type = 'liability' and reporting_classification is null;

-- VAT / tax GL accounts
update chart_of_accounts
set reporting_classification = 'tax_input'
where type = 'asset' and reporting_classification = 'asset_current'
  and (lower(name) like '%vat%recover%' or lower(name) like '%input%vat%' or code = '1150');

update chart_of_accounts
set reporting_classification = 'tax_output'
where type = 'liability' and reporting_classification = 'liability_current'
  and (lower(name) like '%vat%' or lower(name) like '%output%' or code = '2100');

-- P&L: align with account_classification when set
update chart_of_accounts
set reporting_classification = account_classification
where type in ('revenue', 'expense')
  and account_classification is not null
  and reporting_classification is null;

-- Remaining revenue/expense without classification
update chart_of_accounts
set reporting_classification = 'revenue'
where type = 'revenue' and reporting_classification is null;

update chart_of_accounts
set reporting_classification = 'operating_expense'
where type = 'expense' and reporting_classification is null;

alter table chart_of_accounts
  drop constraint if exists chart_of_accounts_reporting_classification_check;

alter table chart_of_accounts
  add constraint chart_of_accounts_reporting_classification_check
  check (
    reporting_classification is null
    or reporting_classification in (
      'asset_current',
      'asset_non_current',
      'liability_current',
      'liability_non_current',
      'equity',
      'revenue',
      'cost_of_sales',
      'operating_expense',
      'other_income',
      'other_expense',
      'tax_input',
      'tax_output'
    )
  );

create index if not exists idx_chart_of_accounts_normalized_name
  on chart_of_accounts (tenant_id, normalized_name);

create index if not exists idx_chart_of_accounts_reporting_classification
  on chart_of_accounts (tenant_id, reporting_classification);

-- ---------------------------------------------------------------------------
-- Keyword → canonical account mapping (global defaults + optional tenant rows)
-- ---------------------------------------------------------------------------
create table if not exists account_mapping_keywords (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  keyword text not null,
  normalized_keyword text not null,
  target_standard_name text not null,
  target_reporting_classification text not null,
  confidence_score numeric not null default 1,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists account_mapping_keywords_global_unique
  on account_mapping_keywords (normalized_keyword)
  where tenant_id is null;

create unique index if not exists account_mapping_keywords_tenant_unique
  on account_mapping_keywords (tenant_id, normalized_keyword)
  where tenant_id is not null;

alter table account_mapping_keywords
  add constraint account_mapping_keywords_target_reporting_classification_check
  check (
    target_reporting_classification in (
      'asset_current',
      'asset_non_current',
      'liability_current',
      'liability_non_current',
      'equity',
      'revenue',
      'cost_of_sales',
      'operating_expense',
      'other_income',
      'other_expense',
      'tax_input',
      'tax_output'
    )
  );

comment on table account_mapping_keywords is
  'Maps user language / synonyms to canonical standard account names and reporting classification.';

alter table account_mapping_keywords enable row level security;

create policy "account_mapping_keywords_select"
  on account_mapping_keywords for select
  using (
    tenant_id is null
    or tenant_id in (
      select tenant_id from app_users where auth_user_id = auth.uid()
    )
  );

insert into account_mapping_keywords (tenant_id, keyword, normalized_keyword, target_standard_name, target_reporting_classification, confidence_score)
select v.tenant_id, v.keyword, v.normalized_keyword, v.target_standard_name, v.target_reporting_classification, v.confidence_score
from (
  values
    (null::uuid, 'freight', 'freight', 'Delivery & Logistics', 'operating_expense', 1::numeric),
    (null, 'shipping', 'shipping', 'Delivery & Logistics', 'operating_expense', 0.95),
    (null, 'courier', 'courier', 'Delivery & Logistics', 'operating_expense', 0.95),
    (null, 'delivery', 'delivery', 'Delivery & Logistics', 'operating_expense', 0.9),
    (null, 'salary', 'salary', 'Salaries & Wages', 'operating_expense', 1::numeric),
    (null, 'payroll', 'payroll', 'Salaries & Wages', 'operating_expense', 1::numeric),
    (null, 'wages', 'wages', 'Salaries & Wages', 'operating_expense', 1::numeric),
    (null, 'rent', 'rent', 'Rent Expense', 'operating_expense', 0.95),
    (null, 'office rent', 'office rent', 'Rent Expense', 'operating_expense', 1::numeric),
    (null, 'facebook ads', 'facebook ads', 'Marketing & Advertising', 'operating_expense', 0.95),
    (null, 'google ads', 'google ads', 'Marketing & Advertising', 'operating_expense', 0.95),
    (null, 'marketing', 'marketing', 'Marketing & Advertising', 'operating_expense', 0.85),
    (null, 'software', 'software', 'Software Subscriptions', 'operating_expense', 0.9),
    (null, 'subscription', 'subscription', 'Software Subscriptions', 'operating_expense', 0.85),
    (null, 'electricity', 'electricity', 'Utilities Expense', 'operating_expense', 0.95),
    (null, 'water', 'water', 'Utilities Expense', 'operating_expense', 0.9),
    (null, 'utilities', 'utilities', 'Utilities Expense', 'operating_expense', 0.9),
    (null, 'consulting', 'consulting', 'Professional Fees', 'operating_expense', 0.9),
    (null, 'legal', 'legal', 'Professional Fees', 'operating_expense', 0.9),
    (null, 'audit', 'audit', 'Professional Fees', 'operating_expense', 0.9),
    (null, 'insurance', 'insurance', 'Insurance Expense', 'operating_expense', 0.95),
    (null, 'cogs', 'cogs', 'Cost of Goods Sold', 'cost_of_sales', 1::numeric),
    (null, 'cost of goods', 'cost of goods', 'Cost of Goods Sold', 'cost_of_sales', 1::numeric)
) as v(tenant_id, keyword, normalized_keyword, target_standard_name, target_reporting_classification, confidence_score)
where not exists (
  select 1 from account_mapping_keywords k
  where k.tenant_id is null and k.normalized_keyword = v.normalized_keyword
);

-- ---------------------------------------------------------------------------
-- v_trial_balance: expose reporting + standardization for reporting engine
-- ---------------------------------------------------------------------------
create or replace view v_trial_balance as
  select
    je.tenant_id,
    ca.id as account_id,
    ca.code,
    ca.name,
    ca.type,
    sum(jl.debit) as total_debit,
    sum(jl.credit) as total_credit,
    ca.account_classification,
    ca.reporting_classification,
    ca.standardized_name,
    ca.normalized_name
  from journal_entries je
  join journal_lines jl on jl.entry_id = je.id
  join chart_of_accounts ca on ca.id = jl.account_id
  where je.status = 'posted'
  group by
    je.tenant_id,
    ca.id,
    ca.code,
    ca.name,
    ca.type,
    ca.account_classification,
    ca.reporting_classification,
    ca.standardized_name,
    ca.normalized_name;
