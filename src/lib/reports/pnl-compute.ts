import { createServerSupabaseClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/posting/posting-engine";
import type { PlLineSection } from "@/lib/accounting/account-classification";
import { classificationToPlSection, isAccountClassification, legacyInferPlSection } from "@/lib/accounting/account-classification";
import { isReportingClassification, reportingClassificationToPlSection } from "@/lib/accounting/reporting-classification";
import {
  isReportingPlCategory,
  reportingCategoryToPlSection,
  type ReportingPlCategory,
} from "@/lib/reports/reporting-categories";
import { sumJournalActivityByAccount } from "./journal-period-aggregates";
import { classifyPnlRowVariance, type PnlRowVariance } from "./variance-pnl";

export type PlAccountLine = {
  id: string;
  code: string;
  name: string;
  section: PlLineSection;
  plSubcategory: string | null;
  sortOrder: number;
  /** P&L magnitude (revenue/oi positive as usual; cos/ope/oth exp as positive for display) */
  current: number;
  prior: number;
  changeAbs: number;
  changePct: number | null;
  variance: PnlRowVariance;
  /** "Recognized" only in v1 */
  view: "recognized" | "billed" | "collected";
};

type Coa = {
  id: string;
  code: string;
  name: string;
  type: string;
  is_cogs: boolean | null;
  account_classification: string | null;
  reporting_classification: string | null;
  reporting_category_type: string | null;
  pl_subcategory: string | null;
  coa_display_order: number | null;
};

function plSectionForAccount(c: Coa): PlLineSection | null {
  if (c.reporting_category_type && isReportingPlCategory(c.reporting_category_type)) {
    return reportingCategoryToPlSection(c.reporting_category_type as ReportingPlCategory);
  }
  if (c.reporting_classification && isReportingClassification(c.reporting_classification)) {
    return reportingClassificationToPlSection(c.reporting_classification);
  }
  if (c.account_classification && isAccountClassification(c.account_classification)) {
    return classificationToPlSection(c.account_classification);
  }
  return legacyInferPlSection({ code: c.code, type: c.type, name: c.name });
}

/** Signed P&L activity: revenue/oi positive when credit-heavy; cos/ox/gain as expense convention positive when debit-heavy. */
function signedPlAmount(
  c: { type: string },
  debit: number,
  credit: number,
  section: PlLineSection,
): number {
  if (section === "revenue" || section === "other_income") {
    return round2(credit - debit);
  }
  if (section === "cost_of_sales" || section === "operating_expenses" || section === "gain_loss") {
    return round2(debit - credit);
  }
  return 0;
}

/** For display, show expenses as positive magnitudes. */
function displayMagnitude(signed: number, section: PlLineSection): number {
  if (section === "cost_of_sales" || section === "operating_expenses" || section === "gain_loss") {
    return round2(Math.abs(signed) || 0);
  }
  return round2(signed);
}

function inferReportingCategoryTypeFromSection(s: PlLineSection): string {
  if (s === "revenue") return "Revenue";
  if (s === "cost_of_sales") return "Cost of Sales";
  if (s === "operating_expenses") return "Operating Expenses";
  if (s === "other_income") return "Other Income";
  return "Other Expenses";
}

export type PlTotals = {
  totalRevenue: number;
  totalCostOfSales: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  totalOperatingExpenses: number;
  operatingProfit: number;
  totalOtherIncome: number;
  totalGainLoss: number;
  netProfit: number;
  netMarginPercent: number | null;
};

function computeTotals(
  lines: { section: PlLineSection; current: number; prior: number }[],
): {
  current: PlTotals;
  prior: PlTotals;
} {
  const sC = (s: PlLineSection) => round2(lines.filter((l) => l.section === s).reduce((a, l) => a + l.current, 0));
  const sP = (s: PlLineSection) => round2(lines.filter((l) => l.section === s).reduce((a, l) => a + l.prior, 0));
  const cRev = sC("revenue");
  const cCos = sC("cost_of_sales");
  const cOpex = sC("operating_expenses");
  const cOi = sC("other_income");
  const cGl = sC("gain_loss");
  const pRev = sP("revenue");
  const pCos = sP("cost_of_sales");
  const pOpex = sP("operating_expenses");
  const pOi = sP("other_income");
  const pGl = sP("gain_loss");
  const gp = round2(cRev - cCos);
  const pGp = round2(pRev - pCos);
  const op = round2(gp - cOpex);
  const pOp = round2(pGp - pOpex);
  const net = round2(op + cOi + cGl);
  const pNet = round2(pOp + pOi + pGl);
  const gmp = cRev > 0 ? (gp / cRev) * 100 : null;
  const pGmp = pRev > 0 ? (pGp / pRev) * 100 : null;
  const nmp = cRev > 0 ? (net / cRev) * 100 : null;
  const pNmp = pRev > 0 ? (pNet / pRev) * 100 : null;
  return {
    current: {
      totalRevenue: cRev,
      totalCostOfSales: cCos,
      grossProfit: gp,
      grossMarginPercent: gmp,
      totalOperatingExpenses: cOpex,
      operatingProfit: op,
      totalOtherIncome: cOi,
      totalGainLoss: cGl,
      netProfit: net,
      netMarginPercent: nmp,
    },
    prior: {
      totalRevenue: pRev,
      totalCostOfSales: pCos,
      grossProfit: pGp,
      grossMarginPercent: pGmp,
      totalOperatingExpenses: pOpex,
      operatingProfit: pOp,
      totalOtherIncome: pOi,
      totalGainLoss: pGl,
      netProfit: pNet,
      netMarginPercent: pNmp,
    },
  };
}

export async function computePnlForRanges(params: {
  tenantId: string;
  startDate: string;
  endDate: string;
  compareStart: string;
  compareEnd: string;
  /** If false, skip the prior-period aggregate (prior amounts are 0; variance mostly "new" vs baseline). */
  withComparison: boolean;
  matAbs: number;
  matPct: number;
  minBothSmall: number;
}): Promise<{
  lines: PlAccountLine[];
  currentTotals: PlTotals;
  priorTotals: PlTotals;
  subcategoryGroups: { key: string; order: string[] }[];
  sectionsOrder: PlLineSection[];
  compareLabel: { current: string; prior: string };
  comparisonActive: boolean;
  grossMarginPpChange: number | null;
  netMarginPpChange: number | null;
}> {
  const {
    tenantId,
    startDate,
    endDate,
    compareStart,
    compareEnd,
    withComparison,
    matAbs,
    matPct,
    minBothSmall,
  } = params;
  const supabase = await createServerSupabaseClient();
  const { data: accRaw, error } = await supabase
    .from("chart_of_accounts")
    .select(
      "id, code, name, type, is_cogs, account_classification, reporting_classification, reporting_category_type, pl_subcategory, coa_display_order",
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("type", ["revenue", "expense"]);
  if (error) throw error;
  const accounts = (accRaw ?? []) as Coa[];

  const curM = await sumJournalActivityByAccount(tenantId, startDate, endDate);
  const prM = withComparison
    ? await sumJournalActivityByAccount(tenantId, compareStart, compareEnd)
    : new Map<string, { debit: number; credit: number }>();

  const out: (PlAccountLine & { _signed: number; _signedP: number })[] = [];
  for (const c of accounts) {
    const s = plSectionForAccount(c);
    if (!s) continue;
    const curD = curM.get(c.id) ?? { debit: 0, credit: 0 };
    const pD = prM.get(c.id) ?? { debit: 0, credit: 0 };
    const signedC = signedPlAmount(c, curD.debit, curD.credit, s);
    const signedP = signedPlAmount(c, pD.debit, pD.credit, s);
    if (signedC === 0 && signedP === 0) continue;
    const current = displayMagnitude(signedC, s);
    const prior = displayMagnitude(signedP, s);
    const ch = round2(current - prior);
    const chPct = prior > 0 ? (ch / prior) * 100 : current > 0 ? 100 : null;
    const variance = classifyPnlRowVariance({
      section: s,
      currentMagnitude: current,
      priorMagnitude: prior,
      matAbs,
      matPct,
      minBothSmall,
    });
    out.push({
      id: c.id,
      code: c.code,
      name: c.name,
      section: s,
      plSubcategory: c.pl_subcategory,
      sortOrder: c.coa_display_order ?? 0,
      current,
      prior,
      changeAbs: ch,
      changePct: chPct,
      variance,
      view: "recognized",
      _signed: signedC,
      _signedP: signedP,
    });
  }
  if (!withComparison) {
    for (const o of out) {
      o.prior = 0;
      o.changeAbs = 0;
      o.changePct = null;
      o.variance = "unchanged";
    }
  }
  out.sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  // strip _signed
  const lines: PlAccountLine[] = out.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ _signed, _signedP, ...l }) => l,
  ) as PlAccountLine[];

  const dbl = out.map((o) => ({ section: o.section, current: o.current, prior: o.prior }));
  const { current: tCur, prior: tPrior } = computeTotals(dbl);

  const opexKeys = [
    ...new Set(out.filter((o) => o.section === "operating_expenses" && o.plSubcategory).map((o) => o.plSubcategory!)),
  ].sort();
  const gmpC = tCur.grossMarginPercent;
  const gmpP = tPrior.grossMarginPercent;
  const nmpC = tCur.netMarginPercent;
  const nmpP = tPrior.netMarginPercent;
  return {
    lines,
    currentTotals: tCur,
    priorTotals: tPrior,
    subcategoryGroups: [{ key: "opex", order: opexKeys }],
    sectionsOrder: [
      "revenue",
      "cost_of_sales",
      "operating_expenses",
      "other_income",
      "gain_loss",
    ],
    comparisonActive: withComparison,
    compareLabel: {
      current: `${startDate}–${endDate}`,
      prior: withComparison ? `${compareStart}–${compareEnd}` : "",
    },
    grossMarginPpChange: withComparison && gmpC != null && gmpP != null ? gmpC - gmpP : null,
    netMarginPpChange: withComparison && nmpC != null && nmpP != null ? nmpC - nmpP : null,
  };
}

export { inferReportingCategoryTypeFromSection, plSectionForAccount };
