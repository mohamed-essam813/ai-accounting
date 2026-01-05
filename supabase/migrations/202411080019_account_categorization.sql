-- Add category field to chart_of_accounts for Current/Non-Current classification
-- Applies to Assets and Liabilities only

-- Add category column
alter table chart_of_accounts
add column if not exists category text check (category in ('current', 'non_current') or category is null);

-- Create index for faster filtering
create index if not exists idx_chart_of_accounts_category 
on chart_of_accounts(tenant_id, category) 
where category is not null;

-- Backfill category for existing accounts based on code ranges
-- Assets: 1000-1499 = current, 1500-1999 = non_current
-- Liabilities: 2000-2499 = current, 2500-2999 = non_current
-- Others: null

update chart_of_accounts
set category = case
  when type = 'asset' and code::int >= 1000 and code::int < 1500 then 'current'
  when type = 'asset' and code::int >= 1500 and code::int < 2000 then 'non_current'
  when type = 'liability' and code::int >= 2000 and code::int < 2500 then 'current'
  when type = 'liability' and code::int >= 2500 and code::int < 3000 then 'non_current'
  else null
end
where category is null;

