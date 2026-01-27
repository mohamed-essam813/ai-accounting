-- Journal Templates table
-- Journal Templates Auto-prefill Accounts

CREATE TABLE IF NOT EXISTS journal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description_default text,
  lines jsonb NOT NULL, -- Array of {line_key, side, default_account_id, default_account_code, default_memo, lock_account}
  is_system boolean NOT NULL DEFAULT false, -- System templates cannot be deleted
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, name)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_journal_templates_tenant_id ON journal_templates(tenant_id);

-- Add comment
COMMENT ON TABLE journal_templates IS 'Journal entry templates with pre-filled accounts and descriptions';
COMMENT ON COLUMN journal_templates.lines IS 'JSONB array: [{line_key: string, side: "debit"|"credit", default_account_id: uuid, default_account_code: text, default_memo: text, lock_account: boolean}]';
