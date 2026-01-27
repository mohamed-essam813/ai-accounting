-- Add detail_type and allow_reconciliation to chart_of_accounts
-- Bank Account Creation & Reconciliation Eligibility

ALTER TABLE chart_of_accounts
ADD COLUMN IF NOT EXISTS detail_type text,
ADD COLUMN IF NOT EXISTS allow_reconciliation boolean NOT NULL DEFAULT false;

-- Add check constraint for detail_type
ALTER TABLE chart_of_accounts
ADD CONSTRAINT check_detail_type CHECK (
  detail_type IS NULL OR detail_type IN ('bank', 'cash', 'other_current_asset', 'fixed_asset', 'other')
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_detail_type ON chart_of_accounts(detail_type);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_allow_reconciliation ON chart_of_accounts(allow_reconciliation);

-- Migration: Set detail_type='bank' for accounts in 1010-1099 range (bank accounts)
UPDATE chart_of_accounts
SET detail_type = 'bank', allow_reconciliation = true
WHERE type = 'asset'
  AND code ~ '^10[1-9][0-9]$'  -- 1010-1099
  AND detail_type IS NULL;

-- Migration: Set detail_type='cash' for code 1000 (Cash)
UPDATE chart_of_accounts
SET detail_type = 'cash', allow_reconciliation = false
WHERE type = 'asset'
  AND code = '1000'
  AND detail_type IS NULL;

-- Add comments
COMMENT ON COLUMN chart_of_accounts.detail_type IS 'Subtype for asset accounts: bank, cash, other_current_asset, fixed_asset, other';
COMMENT ON COLUMN chart_of_accounts.allow_reconciliation IS 'Whether this account can be used for bank reconciliation (only bank accounts)';
