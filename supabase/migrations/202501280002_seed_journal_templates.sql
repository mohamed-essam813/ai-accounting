-- Seed default journal templates for all tenants
-- Journal Templates Auto-prefill Accounts

-- This function will be called after tenant creation or can be run manually
CREATE OR REPLACE FUNCTION seed_journal_templates_for_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_depreciation_expense_id uuid;
  v_accumulated_depreciation_id uuid;
  v_accrued_expenses_id uuid;
  v_general_expense_id uuid;
BEGIN
  -- Get account IDs by code for this tenant
  SELECT id INTO v_depreciation_expense_id
  FROM chart_of_accounts
  WHERE tenant_id = p_tenant_id AND code = '5600' LIMIT 1;

  SELECT id INTO v_accumulated_depreciation_id
  FROM chart_of_accounts
  WHERE tenant_id = p_tenant_id AND code = '1600' LIMIT 1;

  SELECT id INTO v_accrued_expenses_id
  FROM chart_of_accounts
  WHERE tenant_id = p_tenant_id AND code = '2200' LIMIT 1;

  SELECT id INTO v_general_expense_id
  FROM chart_of_accounts
  WHERE tenant_id = p_tenant_id AND code = '5300' LIMIT 1;

  -- Template 1: Depreciation
  INSERT INTO journal_templates (tenant_id, name, description_default, lines, is_system)
  VALUES (
    p_tenant_id,
    'Depreciation',
    'Monthly depreciation',
    jsonb_build_array(
      jsonb_build_object(
        'line_key', 'line_1',
        'side', 'debit',
        'default_account_id', v_depreciation_expense_id,
        'default_account_code', '5600',
        'default_memo', 'Depreciation expense',
        'lock_account', false
      ),
      jsonb_build_object(
        'line_key', 'line_2',
        'side', 'credit',
        'default_account_id', v_accumulated_depreciation_id,
        'default_account_code', '1600',
        'default_memo', 'Accumulated depreciation',
        'lock_account', false
      )
    ),
    true
  )
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- Template 2: Accrual
  INSERT INTO journal_templates (tenant_id, name, description_default, lines, is_system)
  VALUES (
    p_tenant_id,
    'Accrual',
    'Accrual',
    jsonb_build_array(
      jsonb_build_object(
        'line_key', 'line_1',
        'side', 'debit',
        'default_account_id', v_general_expense_id,
        'default_account_code', '5300',
        'default_memo', 'Accrued expense',
        'lock_account', false
      ),
      jsonb_build_object(
        'line_key', 'line_2',
        'side', 'credit',
        'default_account_id', v_accrued_expenses_id,
        'default_account_code', '2200',
        'default_memo', 'Accrued liability',
        'lock_account', false
      )
    ),
    true
  )
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- Template 3: Adjustment (generic, no account prefill)
  INSERT INTO journal_templates (tenant_id, name, description_default, lines, is_system)
  VALUES (
    p_tenant_id,
    'Adjustment',
    'Adjustment',
    jsonb_build_array(
      jsonb_build_object(
        'line_key', 'line_1',
        'side', 'debit',
        'default_account_id', NULL,
        'default_account_code', NULL,
        'default_memo', '',
        'lock_account', false
      ),
      jsonb_build_object(
        'line_key', 'line_2',
        'side', 'credit',
        'default_account_id', NULL,
        'default_account_code', NULL,
        'default_memo', '',
        'lock_account', false
      )
    ),
    true
  )
  ON CONFLICT (tenant_id, name) DO NOTHING;
END;
$$;

-- Seed templates for all existing tenants
DO $$
DECLARE
  tenant_record RECORD;
BEGIN
  FOR tenant_record IN SELECT id FROM tenants LOOP
    PERFORM seed_journal_templates_for_tenant(tenant_record.id);
  END LOOP;
END;
$$;
