import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveKeywordFromStaticMap } from "@/lib/accounting/account-keyword-resolution";
import { normalizeAccountUniquenessKey, normalizeEntityName } from "@/lib/utils/entity-dedupe";

export type CoaMatchAccount = {
  id: string;
  name: string;
  code: string;
  standardized_name: string | null;
  normalized_name: string | null;
  reporting_classification: string | null;
  is_system_standard: boolean;
};

/**
 * Resolve messy user text to keyword hints and existing CoA rows (dedupe / inline-create UX).
 */
export async function resolveCoaUserText(tenantId: string, rawText: string) {
  const normalizedInput = normalizeEntityName(rawText);
  const accountUniquenessKey = normalizeAccountUniquenessKey(rawText);
  const staticKeyword = resolveKeywordFromStaticMap(rawText);

  const supabase = await createServerSupabaseClient();

  const { data: keywordRows } = await supabase
    .from("account_mapping_keywords")
    .select("tenant_id, target_standard_name, target_reporting_classification, confidence_score")
    .eq("normalized_keyword", normalizedInput)
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);

  type KwRow = {
    tenant_id: string | null;
    target_standard_name: string;
    target_reporting_classification: string;
    confidence_score: number;
  };
  let dbKeyword: KwRow | null = null;
  if (keywordRows?.length) {
    dbKeyword =
      (keywordRows as KwRow[]).find((r) => r.tenant_id === tenantId) ??
      (keywordRows as KwRow[]).find((r) => r.tenant_id === null) ??
      null;
  }

  const targetStandardName =
    staticKeyword?.targetStandardName ?? dbKeyword?.target_standard_name ?? null;

  const { data: exactRows } = await supabase
    .from("chart_of_accounts")
    .select(
      "id, name, code, standardized_name, normalized_name, reporting_classification, is_system_standard",
    )
    .eq("tenant_id", tenantId)
    .eq("normalized_name", accountUniquenessKey);

  let standardNameMatches: CoaMatchAccount[] = [];
  if (targetStandardName) {
    const sel =
      "id, name, code, standardized_name, normalized_name, reporting_classification, is_system_standard" as const;
    const [{ data: byStd }, { data: byName }] = await Promise.all([
      supabase.from("chart_of_accounts").select(sel).eq("tenant_id", tenantId).eq("standardized_name", targetStandardName),
      supabase.from("chart_of_accounts").select(sel).eq("tenant_id", tenantId).eq("name", targetStandardName),
    ]);
    const seen = new Set<string>();
    standardNameMatches = [];
    for (const row of [...(byStd ?? []), ...(byName ?? [])]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      standardNameMatches.push(row as CoaMatchAccount);
    }
  }

  const exactNormalizedMatches = (exactRows ?? []) as CoaMatchAccount[];

  return {
    normalizedInput,
    staticKeyword,
    dbKeyword,
    targetStandardName,
    exactNormalizedMatches,
    standardNameMatches,
  };
}
