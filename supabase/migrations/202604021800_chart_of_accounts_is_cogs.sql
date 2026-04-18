-- COGS flag for role-aware invoice posting validation (IFRS perpetual inventory).
alter table public.chart_of_accounts
  add column if not exists is_cogs boolean not null default false;

comment on column public.chart_of_accounts.is_cogs is
  'True when this expense account represents Cost of Goods Sold (allowed on sales invoices with inventory relief).';

update public.chart_of_accounts
set is_cogs = true
where code = '5500'
  and lower(name) like '%cost%goods%';

-- Backfill: strip "(preview)" from posted journal line memos (one-time cleanup).
update public.journal_lines jl
set memo = nullif(trim(regexp_replace(coalesce(memo, ''), '\s*\(preview\)\s*', ' ', 'gi')), '')
where memo is not null
  and memo ~* '\(preview\)';
