-- RPC function for vector similarity search
-- This function performs cosine similarity search on embeddings
-- Note: query_embedding is passed as text and cast to vector type

create or replace function match_embeddings(
  query_embedding text, -- Passed as string "[0.1,0.2,...]" and cast to vector
  match_tenant_id uuid,
  match_threshold float default 0.7,
  match_count int default 5,
  entity_types text[] default null
)
returns table (
  id uuid,
  entity_type text,
  entity_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
declare
  query_vec vector(1536);
begin
  -- Cast text to vector type
  query_vec := query_embedding::vector;
  
  return query
  select
    e.id,
    e.entity_type,
    e.entity_id,
    e.content,
    e.metadata,
    1 - (e.embedding <=> query_vec) as similarity
  from embeddings e
  where e.tenant_id = match_tenant_id
    and (entity_types is null or e.entity_type = any(entity_types))
    and e.embedding is not null
    and 1 - (e.embedding <=> query_vec) >= match_threshold
  order by e.embedding <=> query_vec
  limit match_count;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function match_embeddings to authenticated;
grant execute on function match_embeddings to service_role;

