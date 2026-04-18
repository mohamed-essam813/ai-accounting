-- Stage 2+: richer audit trail + journal reversal links (append-only audit_logs).

alter table public.audit_logs
  add column if not exists resource_type text,
  add column if not exists resource_label text,
  add column if not exists metadata jsonb,
  add column if not exists ip_address text,
  add column if not exists user_agent text;

create index if not exists audit_logs_tenant_created_at_idx on public.audit_logs (tenant_id, created_at desc);
create index if not exists audit_logs_resource_idx on public.audit_logs (resource_type, entity_id);

comment on table public.audit_logs is 'Append-only. No updates/deletes from application roles.';

-- Journal entry reversal graph
alter table public.journal_entries
  add column if not exists reverses_entry_id uuid references public.journal_entries(id) on delete set null,
  add column if not exists reversed_by_entry_id uuid references public.journal_entries(id) on delete set null,
  add column if not exists posted_by uuid references public.app_users(id) on delete set null,
  add column if not exists voided_by uuid references public.app_users(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason_category text,
  add column if not exists void_reason_notes text,
  add column if not exists source_type text default 'standard';

create index if not exists journal_entries_reverses_idx on public.journal_entries (reverses_entry_id);
create index if not exists journal_entries_reversed_by_idx on public.journal_entries (reversed_by_entry_id);

-- Draft / document void metadata (soft void; no hard delete)
alter table public.drafts
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.app_users(id) on delete set null,
  add column if not exists void_reason_category text,
  add column if not exists void_reason_notes text;

alter table public.invoices
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.app_users(id) on delete set null,
  add column if not exists void_reason_category text,
  add column if not exists void_reason_notes text,
  add column if not exists reversed_by_entry_id uuid references public.journal_entries(id) on delete set null;

alter table public.bills
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.app_users(id) on delete set null,
  add column if not exists void_reason_category text,
  add column if not exists void_reason_notes text,
  add column if not exists reversed_by_entry_id uuid references public.journal_entries(id) on delete set null;

alter table public.payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.app_users(id) on delete set null,
  add column if not exists void_reason_category text,
  add column if not exists void_reason_notes text,
  add column if not exists reversed_by_entry_id uuid references public.journal_entries(id) on delete set null;
