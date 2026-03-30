-- PRD: Financial Timeline + period locking (RevenuesFlow alignment)

-- ---------------------------------------------------------------------------
-- 1) Timeline events (chronological business activity feed)
-- ---------------------------------------------------------------------------
create table if not exists timeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  event_type text not null,
  reference_type text not null,
  reference_id uuid not null,
  description text not null,
  event_date date not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_timeline_events_tenant_date
  on timeline_events(tenant_id, event_date desc);

create index if not exists idx_timeline_events_reference
  on timeline_events(tenant_id, reference_type, reference_id);

alter table timeline_events enable row level security;

drop policy if exists "Tenant members read timeline events" on timeline_events;
create policy "Tenant members read timeline events"
  on timeline_events for select
  using (
    tenant_id in (
      select tenant_id from app_users where auth_user_id = auth.uid()
    )
  );

drop policy if exists "Tenant members insert timeline events" on timeline_events;
create policy "Tenant members insert timeline events"
  on timeline_events for insert
  with check (
    tenant_id in (
      select tenant_id from app_users where auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Period close: no posting on or before this date (inclusive)
-- ---------------------------------------------------------------------------
alter table tenants
  add column if not exists accounting_period_closed_through date;

comment on column tenants.accounting_period_closed_through is
  'Books closed through this date (inclusive). Journal entry date must be after this date to post; null means no lock.';

-- ---------------------------------------------------------------------------
-- 3) Allow tenant row updates for admins (profile, base currency, period close)
-- ---------------------------------------------------------------------------
drop policy if exists "Tenant admins update tenant settings" on tenants;
create policy "Tenant admins update tenant settings"
  on tenants for update
  using (
    id in (
      select tenant_id from app_users
      where auth_user_id = auth.uid() and role = 'admin'
    )
  )
  with check (
    id in (
      select tenant_id from app_users
      where auth_user_id = auth.uid() and role = 'admin'
    )
  );
