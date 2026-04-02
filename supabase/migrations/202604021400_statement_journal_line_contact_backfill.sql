-- Backfill journal_lines.contact_id on AR/AP lines from journal entry header and subledger documents.
-- Statement of account is driven by journal_lines.contact_id + AR/AP accounts.
--
-- Note: PostgreSQL does not allow the UPDATE target alias (jl) inside JOIN ... ON of the FROM clause.
-- Use comma-FROM + WHERE joins instead.

-- 1) From posted journal entries (header already has contact)
UPDATE journal_lines jl
SET contact_id = je.contact_id
FROM journal_entries je, chart_of_accounts coa
WHERE jl.entry_id = je.id
  AND jl.account_id = coa.id
  AND coa.tenant_id = je.tenant_id
  AND jl.contact_id IS NULL
  AND je.contact_id IS NOT NULL
  AND (
    coa.prd_account_kind IN ('accounts_receivable', 'accounts_payable')
    OR coa.code IN ('1100', '2000')
  );

-- 2) Supplier bills (AP)
UPDATE journal_lines jl
SET contact_id = b.supplier_id
FROM bills b, chart_of_accounts coa
WHERE b.journal_entry_id = jl.entry_id
  AND jl.account_id = coa.id
  AND coa.tenant_id = b.tenant_id
  AND jl.contact_id IS NULL
  AND b.supplier_id IS NOT NULL
  AND (
    coa.prd_account_kind = 'accounts_payable'
    OR coa.code = '2000'
  );

-- 3) Customer invoices (AR)
UPDATE journal_lines jl
SET contact_id = i.customer_id
FROM invoices i, chart_of_accounts coa
WHERE i.journal_entry_id = jl.entry_id
  AND jl.account_id = coa.id
  AND coa.tenant_id = i.tenant_id
  AND jl.contact_id IS NULL
  AND i.customer_id IS NOT NULL
  AND (
    coa.prd_account_kind = 'accounts_receivable'
    OR coa.code = '1100'
  );
