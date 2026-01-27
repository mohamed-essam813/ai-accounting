-- Add base_currency to tenants table
-- Tenant Base Currency Setting

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'AED';

-- Add comment
COMMENT ON COLUMN tenants.base_currency IS 'Base currency for tenant (ISO 4217 code). Defaults to AED. Used for reporting and currency filter defaults.';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_tenants_base_currency ON tenants(base_currency);

-- Update existing tenants to have a default base currency if null (shouldn't happen with NOT NULL, but safe)
UPDATE tenants
SET base_currency = 'AED'
WHERE base_currency IS NULL;
