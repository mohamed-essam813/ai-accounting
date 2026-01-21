-- Add inventory_account_id and cogs_account_id to inventory_items
-- This allows each inventory item to specify its own inventory and COGS accounts
-- Fixes critical bug where inventory was incorrectly mapped to expense accounts

ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS inventory_account_id uuid REFERENCES chart_of_accounts(id),
ADD COLUMN IF NOT EXISTS cogs_account_id uuid REFERENCES chart_of_accounts(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_items_inventory_account 
ON inventory_items(inventory_account_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_cogs_account 
ON inventory_items(cogs_account_id);

-- Update existing items to use default accounts (code 1200 for inventory, 5500 for COGS)
-- This ensures backward compatibility
UPDATE inventory_items i
SET 
  inventory_account_id = (
    SELECT id FROM chart_of_accounts 
    WHERE code = '1200' 
    AND tenant_id = i.tenant_id 
    LIMIT 1
  ),
  cogs_account_id = (
    SELECT id FROM chart_of_accounts 
    WHERE code = '5500' 
    AND tenant_id = i.tenant_id 
    LIMIT 1
  )
WHERE inventory_account_id IS NULL OR cogs_account_id IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN inventory_items.inventory_account_id IS 'Account ID for inventory asset (default: code 1200)';
COMMENT ON COLUMN inventory_items.cogs_account_id IS 'Account ID for cost of goods sold (default: code 5500)';
