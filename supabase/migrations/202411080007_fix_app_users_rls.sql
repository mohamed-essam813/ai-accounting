-- Fix infinite recursion in app_users RLS policy
-- The original policy was querying app_users itself, causing recursion

-- Drop the problematic policy
drop policy if exists "Users manage their tenant members" on app_users;

-- Create a security definer function to get the current user's tenant_id
-- This avoids recursion because security definer functions bypass RLS
create or replace function get_current_user_tenant_id()
returns uuid as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from app_users
  where auth_user_id = auth.uid()
  limit 1;
  return v_tenant_id;
end;
$$ language plpgsql security definer;

-- Create a single policy that uses the function to avoid recursion
-- Users can see and manage users in their tenant (including themselves)
create policy "Users manage their tenant members"
  on app_users for all
  using (
    -- User can see their own record OR other users in their tenant
    auth_user_id = auth.uid() OR tenant_id = get_current_user_tenant_id()
  )
  with check (
    -- User can modify their own record OR other users in their tenant
    auth_user_id = auth.uid() OR tenant_id = get_current_user_tenant_id()
  );

