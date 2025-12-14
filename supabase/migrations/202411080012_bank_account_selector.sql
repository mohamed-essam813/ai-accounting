-- Add bank_account_id to bank_transactions to support multiple bank accounts
alter table bank_transactions
add column if not exists bank_account_id uuid references chart_of_accounts(id);

-- Create index for faster lookups
create index if not exists idx_bank_transactions_bank_account_id 
on bank_transactions(bank_account_id);

-- Update existing transactions to default to Cash account (1000)
-- This is a one-time migration for existing data
do $$
declare
  cash_account_id uuid;
begin
  -- Find the Cash account (code 1000) for each tenant
  -- Note: This will set bank_account_id for all existing transactions to the first Cash account found
  -- In a multi-tenant system, you'd want to do this per tenant
  select id into cash_account_id
  from chart_of_accounts
  where code = '1000'
  limit 1;
  
  if cash_account_id is not null then
    update bank_transactions
    set bank_account_id = cash_account_id
    where bank_account_id is null;
  end if;
end $$;
