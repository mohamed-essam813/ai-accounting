-- Link register rows to PPE account and originating bill/journal for traceability.

alter table fixed_assets
  add column if not exists asset_account_id uuid references chart_of_accounts(id) on delete set null;

alter table fixed_assets
  add column if not exists source_journal_entry_id uuid references journal_entries(id) on delete set null;

alter table fixed_assets
  add column if not exists source_draft_id uuid references drafts(id) on delete set null;

comment on column fixed_assets.asset_account_id is 'PPE / asset ledger account this register line represents.';
comment on column fixed_assets.source_journal_entry_id is 'Journal posted when the asset was capitalized (e.g. from supplier bill).';
comment on column fixed_assets.source_draft_id is 'Draft that created the asset (e.g. bill draft).';
