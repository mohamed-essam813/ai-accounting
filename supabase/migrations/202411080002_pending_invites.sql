create table if not exists pending_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'accountant', 'business_user', 'auditor')),
  invited_by uuid references app_users(id),
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default timezone('utc', now()) + interval '7 days',
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, email)
);

alter table pending_invites enable row level security;

create policy "Tenant members can manage invites"
  on pending_invites for all using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  )) with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

