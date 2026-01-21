-- FX Rates table for currency conversion
-- Fixes bug: Currency selector was filtering records instead of converting values
-- Correct behavior: Currency switch = presentation layer conversion, NOT data filtering

CREATE TABLE IF NOT EXISTS fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric(18,6) NOT NULL,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, from_currency, to_currency, date)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup 
ON fx_rates(tenant_id, from_currency, to_currency, date DESC);

-- Create index for date range queries
CREATE INDEX IF NOT EXISTS idx_fx_rates_date 
ON fx_rates(tenant_id, date DESC);

-- Row Level Security
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view FX rates in their tenant"
  ON fx_rates FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM app_users WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can manage FX rates in their tenant"
  ON fx_rates FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM app_users WHERE auth_user_id = auth.uid()
  ));

-- Add comment for documentation
COMMENT ON TABLE fx_rates IS 'Foreign exchange rates for currency conversion. Rates are stored per tenant, per currency pair, per date.';
COMMENT ON COLUMN fx_rates.rate IS 'Exchange rate: 1 from_currency = rate to_currency';
