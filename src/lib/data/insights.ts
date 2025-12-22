/**
 * Insights Data Access Layer
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Insight } from "@/lib/insights/types";
import type { Database } from "@/lib/database.types";

type InsightsInsert = Database["public"]["Tables"]["insights"]["Insert"];
type InsightsRow = Database["public"]["Tables"]["insights"]["Row"];

export async function saveInsights(insights: Insight[]): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();
  const tenantId = user.tenant.id;

  // Ensure all insights have tenant_id
  const insightsToInsert: InsightsInsert[] = insights.map((insight) => ({
    tenant_id: tenantId,
    journal_entry_id: insight.journal_entry_id || undefined,
    draft_id: insight.draft_id || undefined,
    category: insight.category,
    level: insight.level,
    insight_text: insight.insight_text,
    context_json: (insight.context_json as Database["public"]["Tables"]["insights"]["Row"]["context_json"]) || null,
  }));

  const table = supabase.from("insights") as unknown as {
    insert: (values: InsightsInsert[]) => Promise<{ error: unknown }>;
  };

  const { error } = await table.insert(insightsToInsert);

  if (error) {
    console.error("Failed to save insights:", error);
    throw error;
  }
}

export async function getInsightsForJournalEntry(
  journalEntryId: string,
): Promise<Insight[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();

  const table = supabase.from("insights") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options?: { ascending?: boolean }) => Promise<{
            data: InsightsRow[] | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const tenantId = user.tenant.id;
  const { data, error } = await table
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("journal_entry_id", journalEntryId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch insights:", error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    journal_entry_id: row.journal_entry_id || undefined,
    draft_id: row.draft_id || undefined,
    category: row.category as Insight["category"],
    level: row.level as Insight["level"],
    insight_text: row.insight_text,
    context_json: (row.context_json as Record<string, unknown>) || undefined,
    created_at: row.created_at,
  }));
}

export async function getRecentPrimaryInsights(limit: number = 10): Promise<Insight[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();

  // Use the view for recent primary insights
  const view = supabase.from("v_recent_primary_insights") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        limit: (count: number) => {
          order: (column: string, options?: { ascending?: boolean }) => Promise<{
            data: Array<{
              id: string;
              tenant_id: string;
              journal_entry_id: string | null;
              draft_id: string | null;
              category: string;
              insight_text: string;
              context_json: unknown;
              created_at: string;
              transaction_date: string | null;
              transaction_description: string | null;
            }> | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const tenantId = user.tenant.id;
  const { data, error } = await view
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(limit)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch recent insights:", error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    journal_entry_id: row.journal_entry_id || undefined,
    draft_id: row.draft_id || undefined,
    category: row.category as Insight["category"],
    level: "primary" as const,
    insight_text: row.insight_text,
    context_json: (row.context_json as Record<string, unknown>) || undefined,
    created_at: row.created_at,
  }));
}

