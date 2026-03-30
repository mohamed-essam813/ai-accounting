-- PRD finalize: journal line tax reference, BRD account role, attachments table name (MVP schema)

-- ---------------------------------------------------------------------------
-- Journal lines: optional tax_rate_id (MVP journal_entry_lines)
-- ---------------------------------------------------------------------------
alter table journal_lines add column if not exists tax_rate_id uuid references tax_rates(id) on delete set null;

create index if not exists idx_journal_lines_tax_rate_id on journal_lines(tax_rate_id)
  where tax_rate_id is not null;

comment on column journal_lines.tax_rate_id is
  'When this line is a tax/VAT line, links to the tax rate used (draft posting).';

-- ---------------------------------------------------------------------------
-- Chart of accounts: optional BRD-aligned role (supplements type/detail_type)
-- ---------------------------------------------------------------------------
alter table chart_of_accounts add column if not exists prd_account_kind text
  check (
    prd_account_kind is null
    or prd_account_kind in (
      'bank',
      'cash',
      'accounts_receivable',
      'accounts_payable',
      'inventory',
      'fixed_asset',
      'revenue',
      'expense',
      'equity',
      'tax',
      'other'
    )
  );

comment on column chart_of_accounts.prd_account_kind is
  'Optional BRD account role for reporting and mapping.';

-- ---------------------------------------------------------------------------
-- Rename source_documents → attachments (MVP schema naming)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'source_documents'
  )
  and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'attachments'
  ) then
    alter table public.source_documents rename to attachments;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'idx_source_documents_tenant_created_at'
  ) then
    alter index public.idx_source_documents_tenant_created_at rename to idx_attachments_tenant_created_at;
  end if;
end $$;

drop policy if exists "Tenant members manage source documents" on public.attachments;
drop policy if exists "Tenant members manage attachments" on public.attachments;

create policy "Tenant members manage attachments"
  on public.attachments for all
  using (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from app_users where auth_user_id = auth.uid()));

-- Rename PK/FK constraint names to match table rename (optional clarity)
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'source_documents_pkey') then
    alter table public.attachments rename constraint source_documents_pkey to attachments_pkey;
  end if;
exception
  when undefined_object then null;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'source_documents_created_by_fkey') then
    alter table public.attachments rename constraint source_documents_created_by_fkey to attachments_created_by_fkey;
  end if;
exception
  when undefined_object then null;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'source_documents_tenant_id_fkey') then
    alter table public.attachments rename constraint source_documents_tenant_id_fkey to attachments_tenant_id_fkey;
  end if;
exception
  when undefined_object then null;
end $$;
