create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled');

create table if not exists subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_cents integer not null,
  currency text not null default 'USD',
  monthly_prompt_limit integer,
  monthly_bank_upload_limit integer,
  seat_limit integer,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  plan_id uuid not null references subscription_plans(id),
  status subscription_status not null default 'trialing',
  current_period_start date,
  current_period_end date,
  trial_ends_at date,
  cancel_at date,
  payment_provider text,
  provider_subscription_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists subscription_usage_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  prompt_count integer not null default 0,
  bank_upload_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, period_start, period_end)
);

alter table subscription_plans enable row level security;
alter table tenant_subscriptions enable row level security;
alter table subscription_usage_snapshots enable row level security;

create policy "Plans are readable by everyone"
  on subscription_plans
  for select
  using (true);

create policy "Tenant members manage subscriptions"
  on tenant_subscriptions
  for all
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ))
  with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Tenant members read usage snapshots"
  on subscription_usage_snapshots
  for select
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Service role updates usage snapshots"
  on subscription_usage_snapshots
  for insert
  with check (true);

create policy "Service role manages usage snapshots update"
  on subscription_usage_snapshots
  for update
  using (true)
  with check (true);

