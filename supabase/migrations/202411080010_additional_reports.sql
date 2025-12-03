-- Cash Flow Statement View
create or replace view v_cash_flow as
  with cash_accounts as (
    select tenant_id, account_id, total_debit, total_credit
    from v_trial_balance
    where code = '1000' -- Cash account
  )
  select
    tenant_id,
    sum(total_debit - total_credit) as net_cash_flow
  from cash_accounts
  group by tenant_id;

-- Journal Ledger View (detailed journal entries with lines)
create or replace view v_journal_ledger as
  select
    je.tenant_id,
    je.id as entry_id,
    je.date,
    je.description,
    je.status,
    je.created_at,
    ca.code as account_code,
    ca.name as account_name,
    jl.debit,
    jl.credit,
    jl.memo
  from journal_entries je
  join journal_lines jl on jl.entry_id = je.id
  join chart_of_accounts ca on ca.id = jl.account_id
  where je.status = 'posted'
  order by je.date desc, je.created_at desc, ca.code;

-- VAT Report View
create or replace view v_vat_report as
  select
    tenant_id,
    sum(case when code = '2100' then total_credit - total_debit else 0 end) as vat_output_tax,
    sum(case when code = '5100' then total_debit - total_credit else 0 end) as vat_input_tax,
    sum(case when code = '2100' then total_credit - total_debit else 0 end) -
    sum(case when code = '5100' then total_debit - total_credit else 0 end) as vat_payable
  from v_trial_balance
  where code in ('2100', '5100')
  group by tenant_id;

