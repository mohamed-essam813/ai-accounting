import type { PlLineSection } from "@/lib/accounting/account-classification";

export type PnlRowVariance = "new" | "dropped" | "material" | "unchanged" | "excluded";

/**
 * P&L row flags with comparison. Expense: increase in magnitude = unfavorable.
 * Revenue/Other income: decrease in magnitude = unfavorable.
 */
export function classifyPnlRowVariance(p: {
  section: PlLineSection;
  currentMagnitude: number;
  priorMagnitude: number;
  matAbs: number;
  matPct: number;
  minBothSmall: number;
}): PnlRowVariance {
  const c = p.currentMagnitude;
  const b = p.priorMagnitude;
  if (c === 0 && b === 0) return "excluded";
  if (c < p.minBothSmall && b < p.minBothSmall) {
    if (c === 0 && b > 0) return "dropped";
    if (b === 0 && c > 0) return "new";
    return "unchanged";
  }
  if (b === 0 && c > 0) return "new";
  if (c === 0 && b > 0) return "dropped";
  const d = c - b;
  const base = b > 0 ? b : c;
  const pct = base > 0 ? (Math.abs(d) / base) * 100 : 0;
  if (Math.abs(d) < p.matAbs || pct < p.matPct) {
    return "unchanged";
  }
  return "material";
}

export function deltaTone(
  section: PlLineSection,
  change: number,
): "favorable" | "unfavorable" | "neutral" {
  if (Math.abs(change) < 0.005) return "neutral";
  if (section === "revenue" || section === "other_income") {
    return change > 0 ? "favorable" : "unfavorable";
  }
  if (section === "cost_of_sales" || section === "operating_expenses" || section === "gain_loss") {
    return change < 0 ? "favorable" : "unfavorable";
  }
  return "neutral";
}
