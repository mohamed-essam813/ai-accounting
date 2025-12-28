-- Update P&L View to include Gain/Loss on Asset Disposal before Net Profit
-- MVP Feedback Section 10.1: Gain/loss must appear before Net Profit

-- Drop and recreate v_profit_and_loss view with gain/loss
drop view if exists v_profit_and_loss;

create or replace view v_profit_and_loss as
  with revenue_accounts as (
    select tenant_id, sum(total_credit - total_debit) as total_revenue
    from v_trial_balance
    where type = 'revenue'
    group by tenant_id
  ),
  expense_accounts as (
    select tenant_id, sum(total_debit - total_credit) as total_expense
    from v_trial_balance
    where type = 'expense'
    group by tenant_id
  ),
  -- Gain on Asset Disposal (Other Income - account 4200)
  gain_on_disposal as (
    select tenant_id, sum(total_credit - total_debit) as total_gain
    from v_trial_balance
    where code = '4200' -- Other Income (where gains are posted)
    group by tenant_id
  ),
  -- Loss on Asset Disposal (could be in expense accounts, but we'll track separately)
  -- For now, losses would be in expense accounts, so we calculate net gain/loss
  net_gain_loss as (
    select 
      g.tenant_id,
      coalesce(g.total_gain, 0) - coalesce(
        (select sum(total_debit - total_credit) 
         from v_trial_balance 
         where tenant_id = g.tenant_id 
           and code in ('5700', '5900') -- Loss accounts if they exist
        ), 0
      ) as net_gain_loss
    from gain_on_disposal g
  )
  select
    r.tenant_id,
    coalesce(r.total_revenue, 0) as total_revenue,
    coalesce(e.total_expense, 0) as total_expense,
    coalesce(r.total_revenue, 0) - coalesce(e.total_expense, 0) as operating_profit,
    coalesce(ngl.net_gain_loss, 0) as gain_loss_on_disposal,
    -- Net Profit = Operating Profit + Gain/Loss on Disposal
    coalesce(r.total_revenue, 0) - coalesce(e.total_expense, 0) + coalesce(ngl.net_gain_loss, 0) as net_income
  from revenue_accounts r
  full outer join expense_accounts e on e.tenant_id = r.tenant_id
  left join net_gain_loss ngl on ngl.tenant_id = coalesce(r.tenant_id, e.tenant_id);

grant select on v_profit_and_loss to authenticated;

