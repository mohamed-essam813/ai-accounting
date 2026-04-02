-- Line-level audit: how the account was chosen (item mapping, tax code, system default, user edit)

alter table journal_lines
  add column if not exists account_source text;

comment on column journal_lines.account_source is
  'item | tax | system_default | user_override — how this line account was determined';

comment on column journal_lines.reference_type is
  'Optional link to business document type (e.g. draft, invoice, bill)';

comment on column journal_lines.reference_id is
  'Optional FK-style id for reference_type (e.g. draft id)';
