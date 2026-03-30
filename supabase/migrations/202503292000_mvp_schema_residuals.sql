-- Remaining MVP schema items vs RevenuesFlow PDF: journal provenance, line dimensions, payments entity

-- ---------------------------------------------------------------------------
-- Journal entry provenance (MVP: source_module)
-- ---------------------------------------------------------------------------
alter table journal_entries add column if not exists source_module text;

comment on column journal_entries.source_module is
  'Where the entry originated: drafts, manual_journal, system_depreciation, bank_import, etc.';

-- ---------------------------------------------------------------------------
-- Journal lines: contact, currency, polymorphic ref (MVP journal_entry_lines)
-- ---------------------------------------------------------------------------
alter table journal_lines add column if not exists contact_id uuid references contacts(id) on delete set null;
alter table journal_lines add column if not exists currency_code text;
alter table journal_lines add column if not exists reference_type text;
alter table journal_lines add column if not exists reference_id uuid;

create index if not exists idx_journal_lines_contact on journal_lines(contact_id) where contact_id is not null;

-- ---------------------------------------------------------------------------
-- Payments (MVP transactions domain) — one row per posted payment draft / payment entry
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  draft_id uuid references drafts(id) on delete set null,
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  payment_type text not null check (payment_type in ('receipt', 'payment')),
  bank_account_id uuid references chart_of_accounts(id) on delete set null,
  amount numeric(18, 2) not null,
  currency_code text,
  payment_date date not null,
  reference text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists payments_journal_entry_id_key on payments(journal_entry_id);
create index if not exists idx_payments_tenant_date on payments(tenant_id, payment_date desc);

alter table payments enable row level security;

drop policy if exists "Tenant members manage payments" on payments;
create policy "Tenant members manage payments"
  on payments for all
  using (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()));
