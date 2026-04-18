-- Server-side aggregation for report period activity (avoids client row limit)

create or replace function public.report_account_activity_sums(
  p_tenant_id uuid,
  p_start date,
  p_end date
)
returns table (
  account_id uuid,
  sum_debit numeric(18, 2),
  sum_credit numeric(18, 2)
)
language sql
stable
security definer
set search_path = public
as $$
  select
    jl.account_id,
    coalesce(sum(jl.debit), 0),
    coalesce(sum(jl.credit), 0)
  from public.journal_lines jl
  inner join public.journal_entries je on je.id = jl.entry_id
  where je.tenant_id = p_tenant_id
    and je.status = 'posted'
    and je.date >= p_start
    and je.date <= p_end
  group by jl.account_id;
$$;

revoke all on function public.report_account_activity_sums(uuid, date, date) from public;
grant execute on function public.report_account_activity_sums(uuid, date, date) to authenticated, service_role;

comment on function public.report_account_activity_sums is
  'Aggregated debit/credit per account for a posted-entries date range. Used by financial reports.';
