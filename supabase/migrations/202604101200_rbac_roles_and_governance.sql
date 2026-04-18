-- Stage 1: RBAC roles (bookkeeper | accountant | admin | super_admin) + governance flags.
-- First user per tenant → super_admin; all other users → admin (conservative default per spec).

alter table public.company_settings
  add column if not exists allow_admin_reverse_and_edit boolean not null default false;

alter table public.company_settings
  add column if not exists rbac_enforcement_enabled boolean not null default false;

comment on column public.company_settings.allow_admin_reverse_and_edit is 'When true, admin may use Reverse & Edit; super_admin always can.';
comment on column public.company_settings.rbac_enforcement_enabled is 'When true, server enforces can() matrix strictly (pair with RBAC_ENFORCEMENT_ENABLED env).';

-- Init schema: app_users and pending_invites have role in ('admin','accountant','business_user','auditor') only.
-- We must drop those checks before assigning super_admin and bookkeeper, then re-add a wider check.
alter table public.app_users
  drop constraint if exists app_users_role_check;
alter table public.pending_invites
  drop constraint if exists pending_invites_role_check;

-- Assign roles: earliest created user per tenant = super_admin, everyone else = admin.
with ranked as (
  select
    id,
    tenant_id,
    row_number() over (partition by tenant_id order by created_at asc) as rn
  from public.app_users
)
update public.app_users u
set role = case when r.rn = 1 then 'super_admin' else 'admin' end
from ranked r
where u.id = r.id;

update public.pending_invites
set role = case role
  when 'business_user' then 'bookkeeper'
  when 'auditor' then 'accountant'
  when 'admin' then 'admin'
  else role
end
where role in ('business_user', 'auditor');

alter table public.app_users
  add constraint app_users_role_check
  check (role in ('bookkeeper', 'accountant', 'admin', 'super_admin'));
alter table public.pending_invites
  add constraint pending_invites_role_check
  check (role in ('bookkeeper', 'accountant', 'admin', 'super_admin'));
