import { redirect } from "next/navigation";
import { ReportsUnifiedShell } from "@/components/reports/reports-unified-shell";
import { getCurrentUser } from "@/lib/data/users";
import { getCompanySettings } from "@/lib/data/company-settings";
import { getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { isReportApiSlug } from "@/lib/reports/report-api-types";
import { reportSlugToTabId, reportTabIdToSlug, resolveReportDates, type ReportTabId } from "@/lib/reports/report-date-defaults";

export const dynamic = "force-dynamic";

const TAB_FROM_LEGACY: Record<string, ReportTabId> = {
  pnl: "pnl",
  balance: "balance",
  cashflow: "cashflow",
  vat: "vat",
  trial: "trial",
  ar: "ar",
  ap: "ap",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

  const startDate = one(p.startDate);
  const endDate = one(p.endDate);
  const tabLegacy = one(p.tab);
  const reportParam = one(p.report);

  const fromLegacy: ReportTabId | undefined = tabLegacy ? TAB_FROM_LEGACY[tabLegacy] : undefined;
  const reportSlug = reportParam
    ? isReportApiSlug(reportParam)
      ? reportParam
      : "pnl"
    : fromLegacy
      ? reportTabIdToSlug(fromLegacy)
      : "pnl";

  const tab = reportSlugToTabId(reportSlug);
  const resolved = resolveReportDates(tab, startDate, endDate);
  if (!startDate || !endDate) {
    const n = new URLSearchParams();
    n.set("report", reportSlug);
    n.set("startDate", resolved.startDate);
    n.set("endDate", resolved.endDate);
    const c = one(p.comparison);
    if (c) n.set("comparison", c);
    if (one(p.compareStart)) n.set("compareStart", one(p.compareStart)!);
    if (one(p.compareEnd)) n.set("compareEnd", one(p.compareEnd)!);
    if (one(p.currency)) n.set("currency", one(p.currency)!);
    redirect(`/reports?${n.toString()}`);
  }

  const user = await getCurrentUser();
  const base = user?.tenant ? await getTenantBaseCurrency(user.tenant.id) : "AED";
  const settings = await getCompanySettings();
  const name = (settings?.company_name ?? "").trim() || "Company";

  return (
    <div className="container max-w-6xl py-6">
      <ReportsUnifiedShell baseCurrency={base} companyName={name} />
    </div>
  );
}
