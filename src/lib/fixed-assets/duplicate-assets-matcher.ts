import type { Database } from "@/lib/database.types";

type FaRow = Pick<
  Database["public"]["Tables"]["fixed_assets"]["Row"],
  "id" | "name" | "cost" | "purchase_date"
>;

const COST_EPS = 0.01;
const MS_DAY = 86400000;

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function levenshteinDamerau(a: string, b: string, max: number = 2): number {
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;
  if (Math.abs(aLen - bLen) > max) return max + 1;
  const prev = Array(bLen + 1);
  const cur = Array(bLen + 1);
  for (let j = 0; j <= bLen; j++) {
    prev[j] = j;
  }
  for (let i = 1; i <= aLen; i++) {
    cur[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const c = a[i - 1];
      const d = b[j - 1];
      const cost = c === d ? 0 : 1;
      const ins = cur[j - 1]! + 1;
      const del = prev[j]! + 1;
      const sub = prev[j - 1]! + cost;
      let best = Math.min(ins, del, sub);
      if (i > 1 && j > 1 && c === b[j - 2] && a[i - 2] === d) {
        const trans = prev[j - 2]! + 1;
        best = Math.min(best, trans);
      }
      cur[j] = best;
    }
    for (let j = 0; j <= bLen; j++) {
      prev[j] = cur[j]!;
    }
  }
  return cur[bLen] as number;
}

function namesFuzzy(a: string, b: string): boolean {
  const n1 = normalizeName(a);
  const n2 = normalizeName(b);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  if (n1.length >= 4 && n2.length >= 4) {
    if (n1.includes(n2) || n2.includes(n1)) return true;
    if (n1.length < 3 || n2.length < 3) return false;
    if (levenshteinDamerau(n1, n2, 2) <= 2) return true;
  }
  return false;
}

export function matchDuplicateCandidate(
  a: { name: string; cost: number; purchaseDate: string },
  b: FaRow,
  windowDays: number = 7,
): boolean {
  if (Math.abs(Number(b.cost) - a.cost) > COST_EPS) return false;
  const t1 = new Date(a.purchaseDate + "T12:00:00").getTime();
  const t2 = new Date(b.purchase_date + "T12:00:00").getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return false;
  if (Math.abs(t1 - t2) / MS_DAY > windowDays) return false;
  if (!namesFuzzy(a.name, b.name)) return false;
  return true;
}
