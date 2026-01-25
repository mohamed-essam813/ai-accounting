-- Prompt Sessions: stateful, resumable prompt resolution pipeline
-- Per feedback doc "5. Fix Prompt Workspace"

create table if not exists prompt_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by uuid not null references app_users(id) on delete cascade,
  original_prompt_text text not null,
  document_ids jsonb default '[]', -- array of source_document ids
  detected_intent text,
  status text not null default 'PENDING_INPUT'
    check (status in ('PENDING_INPUT', 'RESOLVING', 'DRAFT_READY', 'POSTED', 'FAILED')),
  pending_questions jsonb default '[]',  -- [{ key, type, data }, ...]
  resolved_fields jsonb default '{}',   -- { cash_context: false, debit_account_id: "...", ... }
  created_dependencies jsonb default '[]', -- e.g. created account ids
  draft_id uuid references drafts(id) on delete set null,
  data_json jsonb,  -- draft payload, contactId, etc. for resume
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_prompt_sessions_tenant_status
  on prompt_sessions(tenant_id, status);
create index if not exists idx_prompt_sessions_updated
  on prompt_sessions(tenant_id, updated_at desc);

alter table prompt_sessions enable row level security;

drop policy if exists "Users can view their tenant prompt sessions" on prompt_sessions;
drop policy if exists "Users can manage their tenant prompt sessions" on prompt_sessions;

create policy "Users can view their tenant prompt sessions"
  on prompt_sessions for select using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

create policy "Users can manage their tenant prompt sessions"
  on prompt_sessions for all using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

comment on table prompt_sessions is 'Stateful prompt resolution pipeline; supports resume and navigate-away-and-return';
