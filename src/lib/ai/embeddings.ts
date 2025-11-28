import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { env } from "../env";

const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dimensions, cost-effective

const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * Generate embedding vector for a text string
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: text,
  });
  return embedding;
}

/**
 * Store embedding in the database
 */
export async function storeEmbedding(params: {
  tenantId: string;
  entityType: "account" | "transaction" | "policy" | "mapping";
  entityId: string | null;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const embedding = await generateEmbedding(params.content);
  const supabase = createServiceSupabaseClient();

  // Delete existing embedding if entity_id is provided (for updates)
  if (params.entityId) {
    await supabase
      .from("embeddings")
      .delete()
      .eq("tenant_id", params.tenantId)
      .eq("entity_type", params.entityType)
      .eq("entity_id", params.entityId);
  }

  // Insert new embedding
  // Note: Supabase handles vector type conversion automatically when using the correct format
  const { error } = await supabase.from("embeddings").insert({
    tenant_id: params.tenantId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    content: params.content,
    embedding: `[${embedding.join(",")}]`, // pgvector format: [0.1,0.2,...]
    metadata: params.metadata ?? null,
  });

  if (error) {
    console.error("Failed to store embedding:", error);
    throw error;
  }
}

/**
 * Retrieve relevant context using vector similarity search
 */
export async function retrieveRelevantContext(
  query: string,
  tenantId: string,
  options: {
    limit?: number;
    entityTypes?: Array<"account" | "transaction" | "policy" | "mapping">;
    similarityThreshold?: number;
  } = {},
): Promise<Array<{ content: string; metadata: Record<string, unknown> | null; similarity: number }>> {
  const limit = options.limit ?? 5;
  const threshold = options.similarityThreshold ?? 0.7;

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  const embeddingString = `[${queryEmbedding.join(",")}]`;

  const supabase = createServiceSupabaseClient();

  // Use RPC function for vector similarity search
  const { data, error } = await supabase.rpc("match_embeddings", {
    query_embedding: embeddingString,
    match_tenant_id: tenantId,
    match_threshold: threshold,
    match_count: limit,
    entity_types: options.entityTypes?.length ? options.entityTypes : null,
  });

  if (error) {
    console.error("Vector search error:", error);
    // Fallback: return empty array if vector search fails
    return [];
  }

  return (data ?? []).map((item: { content: string; metadata: unknown; similarity: number }) => ({
    content: item.content,
    metadata: (item.metadata as Record<string, unknown>) ?? null,
    similarity: item.similarity,
  }));
}

