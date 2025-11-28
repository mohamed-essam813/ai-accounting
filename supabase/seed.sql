insert into tenants (id, name)
values
  ('11111111-1111-1111-1111-111111111111', 'Demo Corp')
on conflict do nothing;

insert into app_users (id, auth_user_id, tenant_id, email, role)
values
  ('22222222-2222-2222-2222-222222222222', '11111111-2222-3333-4444-555555555555', '11111111-1111-1111-1111-111111111111', 'admin@demo.com', 'admin')
on conflict do nothing;

insert into chart_of_accounts (tenant_id, name, code, type)
values
  ('11111111-1111-1111-1111-111111111111', 'Cash', '1000', 'asset'),
  ('11111111-1111-1111-1111-111111111111', 'Accounts Receivable', '1100', 'asset'),
  ('11111111-1111-1111-1111-111111111111', 'Accounts Payable', '2000', 'liability'),
  ('11111111-1111-1111-1111-111111111111', 'VAT Output Tax', '2100', 'liability'),
  ('11111111-1111-1111-1111-111111111111', 'Sales Revenue', '4000', 'revenue'),
  ('11111111-1111-1111-1111-111111111111', 'Consulting Expense', '5000', 'expense'),
  ('11111111-1111-1111-1111-111111111111', 'VAT Input Tax', '5100', 'asset')
on conflict (tenant_id, code) do nothing;

insert into intent_account_mappings (
  tenant_id,
  intent,
  debit_account_id,
  credit_account_id,
  tax_debit_account_id,
  tax_credit_account_id
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'create_invoice',
    (select id from chart_of_accounts where tenant_id = '11111111-1111-1111-1111-111111111111' and code = '1100'),
    (select id from chart_of_accounts where tenant_id = '11111111-1111-1111-1111-111111111111' and code = '4000'),
    null,
    (select id from chart_of_accounts where tenant_id = '11111111-1111-1111-1111-111111111111' and code = '2100')
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'create_bill',
    (select id from chart_of_accounts where tenant_id = '11111111-1111-1111-1111-111111111111' and code = '5000'),
    (select id from chart_of_accounts where tenant_id = '11111111-1111-1111-1111-111111111111' and code = '2000'),
    (select id from chart_of_accounts where tenant_id = '11111111-1111-1111-1111-111111111111' and code = '5100'),
    null
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'record_payment',
    (select id from chart_of_accounts where tenant_id = '11111111-1111-1111-1111-111111111111' and code = '1000'),
    (select id from chart_of_accounts where tenant_id = '11111111-1111-1111-1111-111111111111' and code = '1100'),
    null,
    null
  )
on conflict (tenant_id, intent) do nothing;

insert into subscription_plans (
  code,
  name,
  description,
  price_cents,
  currency,
  monthly_prompt_limit,
  monthly_bank_upload_limit,
  seat_limit,
  is_active
)
values
  (
    'starter',
    'Starter',
    'Ideal for small teams exploring AI-assisted accounting.',
    9900,
    'USD',
    1000,
    100,
    5,
    true
  ),
  (
    'growth',
    'Growth',
    'Includes higher limits and priority support.',
    19900,
    'USD',
    5000,
    500,
    25,
    true
  ),
  (
    'enterprise',
    'Enterprise',
    'Custom limits and dedicated onboarding.',
    0,
    'USD',
    null,
    null,
    null,
    true
  )
on conflict (code) do nothing;

insert into tenant_subscriptions (
  tenant_id,
  plan_id,
  status,
  current_period_start,
  current_period_end
)
select
  '11111111-1111-1111-1111-111111111111',
  id,
  'active',
  date_trunc('month', timezone('utc', now()))::date,
  (date_trunc('month', timezone('utc', now())) + interval '1 month - 1 day')::date
from subscription_plans
where code = 'starter'
on conflict (tenant_id) do nothing;

