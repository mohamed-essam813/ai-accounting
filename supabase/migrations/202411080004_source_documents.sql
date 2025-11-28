create table if not exists source_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by uuid references app_users(id),
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  vision_text text,
  vision_json jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_source_documents_tenant_created_at
  on source_documents (tenant_id, created_at desc);

alter table source_documents enable row level security;

create policy "Tenant members manage source documents"
  on source_documents
  for all
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ))
  with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

