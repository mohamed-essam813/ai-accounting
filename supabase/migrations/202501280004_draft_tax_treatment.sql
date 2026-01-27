-- Add tax_treatment to drafts table
-- Tax Inclusive/Exclusive handling

ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS tax_treatment text DEFAULT 'exclusive';

-- Add check constraint
ALTER TABLE drafts
ADD CONSTRAINT check_tax_treatment CHECK (
  tax_treatment IS NULL OR tax_treatment IN ('exclusive', 'inclusive')
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_drafts_tax_treatment ON drafts(tax_treatment);

-- Add comment
COMMENT ON COLUMN drafts.tax_treatment IS 'Tax calculation method: exclusive (tax added on top) or inclusive (tax included in amount). Default: exclusive.';
