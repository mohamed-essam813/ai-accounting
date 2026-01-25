-- Check if a tax rate is used in any posted draft (for immutability rules)
create or replace function tax_rate_used_in_posted_drafts(p_tenant_id uuid, p_rate_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from drafts
    where tenant_id = p_tenant_id
      and status = 'posted'
      and (data_json->'entities'->'tax'->>'tax_rate_id') = p_rate_id::text
  );
$$;
