create table if not exists ai_prompt_cache (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  prompt_hash text not null,
  prompt_text text not null,
  model text not null,
  response_json jsonb not null,
  usage_count integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, prompt_hash, model)
);

create table if not exists ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references app_users(id),
  prompt_hash text not null,
  model text not null,
  cache_hit boolean not null default false,
  estimated_prompt_tokens integer,
  estimated_response_tokens integer,
  total_tokens integer,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ai_usage_logs_tenant_created_at
  on ai_usage_logs (tenant_id, created_at desc);

alter table ai_prompt_cache enable row level security;
alter table ai_usage_logs enable row level security;

create policy "Tenant members manage prompt cache"
  on ai_prompt_cache
  for all
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ))
  with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Tenant members view usage logs"
  on ai_usage_logs
  for select using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Service role inserts usage logs"
  on ai_usage_logs
  for insert
  with check (true);

