-- AR/AP Ageing Reports
-- Calculates receivables and payables by ageing buckets

-- Accounts Receivable Ageing View
-- Groups invoices by customer and ageing buckets (0-30, 31-60, 61-90, 90+ days)
create or replace view v_ar_ageing as
  with invoice_entries as (
    select
      d.tenant_id,
      d.id as draft_id,
      d.data_json->>'counterparty' as customer_name,
      d.data_json->>'invoice_number' as invoice_number,
      d.data_json->>'amount' as amount,
      d.data_json->>'currency' as currency,
      d.data_json->>'date' as invoice_date,
      d.data_json->>'due_date' as due_date,
      je.id as entry_id,
      je.date as entry_date,
      jl.debit as receivable_amount
    from drafts d
    join journal_entries je on je.id = d.posted_entry_id
    join journal_lines jl on jl.entry_id = je.id
    join chart_of_accounts ca on ca.id = jl.account_id
    where d.intent = 'create_invoice'
      and d.status = 'posted'
      and ca.code = '1100'  -- Accounts Receivable
      and jl.debit > 0
  ),
  payments as (
    -- Calculate payments against receivables
    select
      d.tenant_id,
      d.data_json->>'counterparty' as customer_name,
      d.data_json->>'invoice_number' as invoice_number,
      jl.credit as payment_amount
    from drafts d
    join journal_entries je on je.id = d.posted_entry_id
    join journal_lines jl on jl.entry_id = je.id
    join chart_of_accounts ca on ca.id = jl.account_id
    where d.intent = 'record_payment'
      and d.status = 'posted'
      and ca.code = '1100'  -- Accounts Receivable (credit reduces AR)
      and jl.credit > 0
  ),
  outstanding as (
    select
      ie.tenant_id,
      ie.customer_name,
      ie.invoice_number,
      ie.entry_date::date as entry_date,
      coalesce(
        nullif(ie.due_date, '')::date,
        (ie.entry_date::date + 30)
      ) as due_date,
      ie.receivable_amount,
      coalesce(sum(p.payment_amount), 0) as total_payments,
      (ie.receivable_amount - coalesce(sum(p.payment_amount), 0)) as outstanding_amount
    from invoice_entries ie
    left join payments p on p.tenant_id = ie.tenant_id
      and p.customer_name = ie.customer_name
      and p.invoice_number = ie.invoice_number
    group by ie.tenant_id, ie.customer_name, ie.invoice_number, ie.entry_date, ie.due_date, ie.receivable_amount
  )
  select
    tenant_id,
    customer_name,
    invoice_number,
    entry_date,
    due_date,
    outstanding_amount,
    (current_date - due_date) as days_overdue,
    case
      when (current_date - due_date) <= 0 then outstanding_amount
      else 0
    end as current_0_30,
    case
      when (current_date - due_date) > 0 and (current_date - due_date) <= 30 then outstanding_amount
      else 0
    end as days_31_60,
    case
      when (current_date - due_date) > 30 and (current_date - due_date) <= 60 then outstanding_amount
      else 0
    end as days_61_90,
    case
      when (current_date - due_date) > 60 then outstanding_amount
      else 0
    end as days_90_plus
  from outstanding
  where outstanding_amount > 0;

-- Accounts Payable Ageing View
-- Groups bills by vendor and ageing buckets
create or replace view v_ap_ageing as
  with bill_entries as (
    select
      d.tenant_id,
      d.id as draft_id,
      d.data_json->>'counterparty' as vendor_name,
      d.data_json->>'invoice_number' as bill_number,
      d.data_json->>'amount' as amount,
      d.data_json->>'currency' as currency,
      d.data_json->>'date' as bill_date,
      d.data_json->>'due_date' as due_date,
      je.id as entry_id,
      je.date as entry_date,
      jl.credit as payable_amount
    from drafts d
    join journal_entries je on je.id = d.posted_entry_id
    join journal_lines jl on jl.entry_id = je.id
    join chart_of_accounts ca on ca.id = jl.account_id
    where d.intent = 'create_bill'
      and d.status = 'posted'
      and ca.code = '2000'  -- Accounts Payable
      and jl.credit > 0
  ),
  payments as (
    -- Calculate payments against payables
    select
      d.tenant_id,
      d.data_json->>'counterparty' as vendor_name,
      d.data_json->>'invoice_number' as bill_number,
      jl.debit as payment_amount
    from drafts d
    join journal_entries je on je.id = d.posted_entry_id
    join journal_lines jl on jl.entry_id = je.id
    join chart_of_accounts ca on ca.id = jl.account_id
    where d.intent = 'record_payment'
      and d.status = 'posted'
      and ca.code = '2000'  -- Accounts Payable (debit reduces AP)
      and jl.debit > 0
  ),
  outstanding as (
    select
      be.tenant_id,
      be.vendor_name,
      be.bill_number,
      be.entry_date::date as entry_date,
      coalesce(
        nullif(be.due_date, '')::date,
        (be.entry_date::date + 30)
      ) as due_date,
      be.payable_amount,
      coalesce(sum(p.payment_amount), 0) as total_payments,
      (be.payable_amount - coalesce(sum(p.payment_amount), 0)) as outstanding_amount
    from bill_entries be
    left join payments p on p.tenant_id = be.tenant_id
      and p.vendor_name = be.vendor_name
      and p.bill_number = be.bill_number
    group by be.tenant_id, be.vendor_name, be.bill_number, be.entry_date, be.due_date, be.payable_amount
  )
  select
    tenant_id,
    vendor_name,
    bill_number,
    entry_date,
    due_date,
    outstanding_amount,
    (current_date - due_date) as days_overdue,
    case
      when (current_date - due_date) <= 0 then outstanding_amount
      else 0
    end as current_0_30,
    case
      when (current_date - due_date) > 0 and (current_date - due_date) <= 30 then outstanding_amount
      else 0
    end as days_31_60,
    case
      when (current_date - due_date) > 30 and (current_date - due_date) <= 60 then outstanding_amount
      else 0
    end as days_61_90,
    case
      when (current_date - due_date) > 60 then outstanding_amount
      else 0
    end as days_90_plus
  from outstanding
  where outstanding_amount > 0;

-- Summary views for totals by customer/vendor
create or replace view v_ar_ageing_summary as
  select
    tenant_id,
    customer_name,
    sum(current_0_30) as total_current,
    sum(days_31_60) as total_31_60,
    sum(days_61_90) as total_61_90,
    sum(days_90_plus) as total_90_plus,
    sum(outstanding_amount) as total_outstanding
  from v_ar_ageing
  group by tenant_id, customer_name;

create or replace view v_ap_ageing_summary as
  select
    tenant_id,
    vendor_name,
    sum(current_0_30) as total_current,
    sum(days_31_60) as total_31_60,
    sum(days_61_90) as total_61_90,
    sum(days_90_plus) as total_90_plus,
    sum(outstanding_amount) as total_outstanding
  from v_ap_ageing
  group by tenant_id, vendor_name;

-- Grant access
grant select on v_ar_ageing to authenticated;
grant select on v_ar_ageing_summary to authenticated;
grant select on v_ap_ageing to authenticated;
grant select on v_ap_ageing_summary to authenticated;

