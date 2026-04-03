/**
 * Fuzzy matching for chart-of-accounts search (inline create / duplicate avoidance).
 */

import { normalizeEntityName } from "@/lib/utils/entity-dedupe";

export type AccountLike = { id: string; name: string; code: string; type: string };

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const v0 = new Array<number>(n + 1);
  const v1 = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) v0[j] = j;
  for (let i = 0; i < m; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < n; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= n; j++) v0[j] = v1[j];
  }
  return v0[n];
}

/**
 * Returns 0–1 where 1 is identical normalized names.
 */
export function accountNameSimilarityScore(query: string, accountName: string): number {
  const q = normalizeEntityName(query);
  const n = normalizeEntityName(accountName);
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (n.includes(q) || q.includes(n)) return 0.9;
  const qTokens = new Set(q.split(/\s+/).filter(Boolean));
  const nTokens = new Set(n.split(/\s+/).filter(Boolean));
  let overlap = 0;
  for (const t of qTokens) {
    if (nTokens.has(t)) overlap++;
  }
  const union = qTokens.size + nTokens.size - overlap;
  const jaccard = union > 0 ? overlap / union : 0;
  const maxLen = Math.max(q.length, n.length);
  const levRatio = maxLen > 0 ? 1 - levenshtein(q, n) / maxLen : 0;
  return Math.max(jaccard * 0.85, levRatio * 0.95);
}

export function findSimilarAccountOptions<T extends AccountLike>(
  query: string,
  candidates: T[],
  minScore: number,
  limit: number,
): Array<{ option: T; score: number }> {
  const q = query.trim();
  if (!q) return [];
  const scored = candidates
    .map((option) => ({
      option,
      score: accountNameSimilarityScore(q, option.name),
    }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
}

export function findBestSimilarAccount<T extends AccountLike>(
  query: string,
  candidates: T[],
): { option: T; score: number } | null {
  const list = findSimilarAccountOptions(query, candidates, 0.01, 1);
  return list[0] ?? null;
}

/** Above this score, prompt user before creating a near-duplicate. */
export const DUPLICATE_WARNING_SCORE = 0.82;
