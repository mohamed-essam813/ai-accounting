-- Explicit P&L grouping for chart_of_accounts (not inferred from code ranges).

alter table chart_of_accounts
  add column if not exists account_classification text;

alter table chart_of_accounts
  drop constraint if exists chart_of_accounts_account_classification_check;

alter table chart_of_accounts
  add constraint chart_of_accounts_account_classification_check
  check (
    account_classification is null
    or account_classification in (
      'revenue',
      'cost_of_sales',
      'operating_expense',
      'other_income',
      'other_expense'
    )
  );

comment on column chart_of_accounts.account_classification is
  'Profit and Loss section. Drives P&L grouping; must not be inferred from account name alone for new accounts.';

-- Trial balance must expose classification for reporting.
-- New columns must be appended after existing ones (PostgreSQL cannot reorder columns on REPLACE VIEW).
create or replace view v_trial_balance as
  select
    je.tenant_id,
    ca.id as account_id,
    ca.code,
    ca.name,
    ca.type,
    sum(jl.debit) as total_debit,
    sum(jl.credit) as total_credit,
    ca.account_classification
  from journal_entries je
  join journal_lines jl on jl.entry_id = je.id
  join chart_of_accounts ca on ca.id = jl.account_id
  where je.status = 'posted'
  group by je.tenant_id, ca.id, ca.code, ca.name, ca.type, ca.account_classification;

-- Backfill existing rows
update chart_of_accounts
set account_classification = 'cost_of_sales'
where type = 'expense'
  and account_classification is null
  and (
    lower(name) like '%cost of goods sold%'
    or code = '5500'
  );

update chart_of_accounts
set account_classification = 'other_income'
where type = 'revenue'
  and account_classification is null
  and code = '4200';

update chart_of_accounts
set account_classification = 'revenue'
where type = 'revenue'
  and account_classification is null;

update chart_of_accounts
set account_classification = 'operating_expense'
where type = 'expense'
  and account_classification is null;
