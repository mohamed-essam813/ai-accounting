/**
 * Fuzzy matching for contact duplicate detection (no DB extension required in app layer).
 */

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

/** 0–1 similarity score (1 = identical). */
export function similarityRatio(a: string, b: string): number {
  const s = a.trim().toLowerCase();
  const t = b.trim().toLowerCase();
  if (!s && !t) return 1;
  if (!s || !t) return 0;
  if (s === t) return 1;
  const d = levenshtein(s, t);
  const maxLen = Math.max(s.length, t.length);
  return 1 - d / maxLen;
}

export type SimilarityBand = "high" | "medium" | "low";

export function similarityBand(ratio: number): SimilarityBand {
  if (ratio >= 0.92) return "high";
  if (ratio >= 0.85) return "medium";
  return "low";
}
