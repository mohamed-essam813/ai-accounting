-- Balance sheet presentation: optional override when COA type does not match economic substance (e.g. owner capital posted to wrong type).
alter table chart_of_accounts
  add column if not exists balance_sheet_role text;

comment on column chart_of_accounts.balance_sheet_role is
  'Optional BS classification override: owner_equity, owner_loan, receivable_from_owner — reporting uses this over raw type.';

alter table chart_of_accounts
  drop constraint if exists chart_of_accounts_balance_sheet_role_check;

alter table chart_of_accounts
  add constraint chart_of_accounts_balance_sheet_role_check
  check (
    balance_sheet_role is null
    or balance_sheet_role in ('owner_equity', 'owner_loan', 'receivable_from_owner')
  );

-- v_trial_balance: include balance_sheet_role for reporting engine
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
    ca.normalized_name,
    ca.balance_sheet_role
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
    ca.normalized_name,
    ca.balance_sheet_role;
