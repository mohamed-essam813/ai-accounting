-- Fix RLS for inventory balances/ageing updates during posting.

-- inventory_balances: allow tenant members to insert/update/delete within their tenant
drop policy if exists "Users can manage inventory balances in their tenant" on inventory_balances;
create policy "Users can manage inventory balances in their tenant"
  on inventory_balances for all
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ))
  with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

-- inventory_ageing: posting updates this table too (FIFO batches)
drop policy if exists "Users can manage inventory ageing in their tenant" on inventory_ageing;
create policy "Users can manage inventory ageing in their tenant"
  on inventory_ageing for all
  using (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ))
  with check (tenant_id in (
    select tenant_id from app_users where auth_user_id = auth.uid()
  ));

