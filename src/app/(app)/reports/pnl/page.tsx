import { redirect } from "next/navigation";
import { isReportApiSlug } from "@/lib/reports/report-api-types";
import { reportTabIdToSlug, resolveReportDates, type ReportTabId } from "@/lib/reports/report-date-defaults";

const LEGACY_TAB: Record<string, ReportTabId> = {
  pnl: "pnl",
  balance: "balance",
  cashflow: "cashflow",
  vat: "vat",
  trial: "trial",
  ar: "ar",
  ap: "ap",
};

/** Old URL: `/reports/pnl?tab=…&startDate=…` → `/reports?report=…&…` */
export default async function LegacyReportsPnlPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

  const startDate = one(p.startDate);
  const endDate = one(p.endDate);
  const tabKey = (one(p.tab) as string | undefined) || "pnl";
  const tab: ReportTabId = LEGACY_TAB[tabKey] ?? "pnl";
  const report = reportTabIdToSlug(tab);
  const resolved = resolveReportDates(tab, startDate, endDate);
  const n = new URLSearchParams();
  const r = one(p.report);
  n.set("report", r && isReportApiSlug(r) ? r : report);
  n.set("startDate", startDate ?? resolved.startDate);
  n.set("endDate", endDate ?? resolved.endDate);
  if (one(p.comparison)) n.set("comparison", one(p.comparison)!);
  if (one(p.compareStart)) n.set("compareStart", one(p.compareStart)!);
  if (one(p.compareEnd)) n.set("compareEnd", one(p.compareEnd)!);
  if (one(p.currency)) n.set("currency", one(p.currency)!);
  redirect(`/reports?${n.toString()}`);
}
