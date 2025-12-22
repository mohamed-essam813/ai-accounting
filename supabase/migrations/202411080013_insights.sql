-- Insights table for storing financial insights generated after transactions
create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  journal_entry_id uuid references journal_entries(id) on delete cascade,
  draft_id uuid references drafts(id) on delete set null,
  
  -- Insight metadata
  category text not null check (category in (
    'financial_impact',
    'cash_flow',
    'risk',
    'trend_behavior',
    'actionable_next_step'
  )),
  level text not null check (level in ('primary', 'secondary', 'deep_dive')),
  insight_text text not null,
  
  -- Context data for the insight
  context_json jsonb,
  
  -- Metadata
  created_at timestamptz not null default timezone('utc', now()),
  
  -- Ensure at least one reference exists
  constraint insights_reference_check check (
    journal_entry_id is not null or draft_id is not null
  )
);

-- Indexes for performance
create index if not exists idx_insights_tenant_id on insights(tenant_id);
create index if not exists idx_insights_journal_entry_id on insights(journal_entry_id);
create index if not exists idx_insights_draft_id on insights(draft_id);
create index if not exists idx_insights_category on insights(category);
create index if not exists idx_insights_level on insights(level);
create index if not exists idx_insights_created_at on insights(created_at desc);

-- Row Level Security
alter table insights enable row level security;

create policy "Users can view insights in their tenant"
  on insights for select using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users can insert insights in their tenant"
  on insights for insert with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

-- View for recent insights (last 30 days, primary level only)
create or replace view v_recent_primary_insights as
  select
    i.id,
    i.tenant_id,
    i.journal_entry_id,
    i.draft_id,
    i.category,
    i.insight_text,
    i.context_json,
    i.created_at,
    je.date as transaction_date,
    je.description as transaction_description
  from insights i
  left join journal_entries je on je.id = i.journal_entry_id
  where i.level = 'primary'
    and i.created_at >= (now() - interval '30 days')
  order by i.created_at desc;

-- Grant access to view
grant select on v_recent_primary_insights to authenticated;

