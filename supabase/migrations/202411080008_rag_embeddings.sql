-- RAG (Retrieval-Augmented Generation) Support
-- Enable pgvector extension for vector similarity search
create extension if not exists vector;

-- Embeddings table to store vector embeddings for RAG
create table if not exists embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entity_type text not null check (entity_type in ('account', 'transaction', 'policy', 'mapping')),
  entity_id uuid, -- References the actual entity (account_id, journal_entry_id, etc.)
  content text not null, -- The text content that was embedded
  embedding vector(1536), -- OpenAI text-embedding-3-small uses 1536 dimensions
  metadata jsonb, -- Additional metadata (account code, transaction date, etc.)
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- Unique constraint: one embedding per tenant + entity type + entity_id combination
  unique(tenant_id, entity_type, entity_id)
);

-- Index for vector similarity search
create index if not exists idx_embeddings_tenant_entity 
  on embeddings (tenant_id, entity_type, entity_id);

-- Vector similarity index using HNSW for fast approximate nearest neighbor search
create index if not exists idx_embeddings_vector 
  on embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Enable RLS
alter table embeddings enable row level security;

-- Policy: Users can view embeddings for their tenant
create policy "Users view tenant embeddings"
  on embeddings for select
  using (tenant_id = get_current_user_tenant_id());

-- Policy: Service role can manage embeddings (for automatic updates)
create policy "Service role manages embeddings"
  on embeddings for all
  using (true)
  with check (true);

-- Function to automatically create/update embeddings for accounts
create or replace function fn_update_account_embedding()
returns trigger as $$
begin
  -- Delete old embedding if exists
  delete from embeddings 
  where tenant_id = new.tenant_id 
    and entity_type = 'account' 
    and entity_id = new.id;
  
  -- Insert will be done by application code after generating embedding
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to clean up embeddings when account is deleted
drop trigger if exists trg_account_embedding_delete on chart_of_accounts;
create trigger trg_account_embedding_delete
after delete on chart_of_accounts
for each row execute function fn_update_account_embedding();

-- Function to clean up embeddings when journal entry is deleted
create or replace function fn_cleanup_transaction_embedding()
returns trigger as $$
begin
  delete from embeddings 
  where tenant_id = old.tenant_id 
    and entity_type = 'transaction' 
    and entity_id = old.id;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_journal_entry_embedding_delete on journal_entries;
create trigger trg_journal_entry_embedding_delete
after delete on journal_entries
for each row execute function fn_cleanup_transaction_embedding();

