-- Multi-Currency Support for Journal Entries
-- MVP Feedback Section 1: Currency Filter & Multi-currency Handling

-- Add currency fields to journal_entries table
alter table journal_entries
add column if not exists transaction_currency text,
add column if not exists amount_in_transaction_currency numeric(18,2),
add column if not exists base_currency text,
add column if not exists fx_rate numeric(10,6),
add column if not exists amount_in_base_currency numeric(18,2);

-- Add comment for documentation
comment on column journal_entries.transaction_currency is 'Currency code of the transaction (e.g., USD, EUR, AED)';
comment on column journal_entries.amount_in_transaction_currency is 'Transaction amount in the transaction currency';
comment on column journal_entries.base_currency is 'Base currency for the tenant (default reporting currency)';
comment on column journal_entries.fx_rate is 'Exchange rate from transaction currency to base currency (null if same currency)';
comment on column journal_entries.amount_in_base_currency is 'Transaction amount converted to base currency';

-- Create index for currency filtering
create index if not exists idx_journal_entries_transaction_currency 
on journal_entries(tenant_id, transaction_currency) 
where transaction_currency is not null;

-- For existing entries, try to extract currency from drafts if available
-- This is a one-time migration for existing data
do $$
declare
  draft_record record;
  entry_record record;
  draft_currency text;
  draft_amount numeric;
begin
  -- Loop through all posted drafts and update their journal entries
  for draft_record in 
    select d.id, d.posted_entry_id, d.data_json, d.tenant_id
    from drafts d
    where d.posted_entry_id is not null
    and d.status = 'posted'
  loop
    -- Extract currency and amount from draft data_json
    draft_currency := draft_record.data_json->>'currency';
    draft_amount := (draft_record.data_json->>'amount')::numeric;
    
    if draft_currency is not null and draft_amount is not null then
      -- Get the tenant's base currency (default to USD if not set)
      -- For now, we'll use a default. In production, this should come from tenant settings
      declare
        tenant_base_currency text := 'USD'; -- Default, should be configurable per tenant
        calculated_fx_rate numeric := 1.0; -- Default 1:1, should be fetched from FX service
        calculated_base_amount numeric;
      begin
        -- If transaction currency equals base currency, fx_rate is 1.0
        if draft_currency = tenant_base_currency then
          calculated_fx_rate := 1.0;
        else
          -- For MVP, use 1.0 as default. In production, fetch from FX service or tenant settings
          calculated_fx_rate := 1.0;
        end if;
        
        calculated_base_amount := draft_amount * calculated_fx_rate;
        
        -- Update the journal entry
        update journal_entries
        set 
          transaction_currency = draft_currency,
          amount_in_transaction_currency = draft_amount,
          base_currency = tenant_base_currency,
          fx_rate = calculated_fx_rate,
          amount_in_base_currency = calculated_base_amount
        where id = draft_record.posted_entry_id
        and tenant_id = draft_record.tenant_id
        and transaction_currency is null; -- Only update if not already set
      end;
    end if;
  end loop;
end $$;
