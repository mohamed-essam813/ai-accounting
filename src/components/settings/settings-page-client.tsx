"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Database, Json } from "@/lib/database.types";
import type { CompanySettingsRow, UsefulLifeDefaultRow } from "@/lib/data/company-settings";
import {
  saveAccountingSectionAction,
  saveApprovalSectionAction,
  saveCompanyProfileSectionAction,
  saveReportsSectionAction,
  saveTaxSectionAction,
} from "@/lib/actions/company-settings";
import {
  EXEMPT_VAT_OPTIONS,
  SETTINGS_SECTIONS,
  UAE_EMIRATES,
  UAE_INDUSTRIES,
  ZERO_RATED_VAT_OPTIONS,
} from "@/lib/settings/constants";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { SubscriptionManager } from "@/components/settings/subscription-manager";
import { TaxRatesForm } from "@/components/settings/tax-rates-form";
import { PeriodCloseForm } from "@/components/settings/period-close-form";
type AppUserRow = Database["public"]["Tables"]["app_users"]["Row"];

type SubscriptionBundle = {
  plans: Awaited<ReturnType<typeof import("@/lib/data/subscriptions").listSubscriptionPlans>>;
  subscription: Awaited<ReturnType<typeof import("@/lib/data/subscriptions").getTenantSubscription>>;
  usage: Awaited<ReturnType<typeof import("@/lib/data/subscriptions").getSubscriptionUsage>>;
};

type Props = {
  canManage: boolean;
  settings: CompanySettingsRow;
  usefulLife: UsefulLifeDefaultRow[];
  hasTransactions: boolean;
  subscriptionBundle: SubscriptionBundle;
  currentUser: AppUserRow;
  periodClosedThrough: string | null;
};

function asStringArray(j: Json | null | undefined): string[] {
  if (j == null) return [];
  if (Array.isArray(j)) return j.filter((x): x is string => typeof x === "string");
  return [];
}

function dirtyJson(a: unknown, b: unknown) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function SettingsPageClient({
  canManage,
  settings,
  usefulLife,
  hasTransactions,
  subscriptionBundle,
  currentUser,
  periodClosedThrough,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string>(SETTINGS_SECTIONS[0].id);

  // —— Company profile ——
  const [cName, setCName] = useState(settings.company_name);
  const [cTrade, setCTrade] = useState(settings.trade_license_number ?? "");
  const [cLogo, setCLogo] = useState<string | null>(settings.logo_url);
  const [cAddr, setCAddr] = useState(settings.registered_address ?? "");
  const [cEmirate, setCEmirate] = useState(settings.home_emirate ?? "");
  const [cCountry, setCCountry] = useState(settings.country);
  const [cPhone, setCPhone] = useState(settings.phone ?? "");
  const [cEmail, setCEmail] = useState(settings.email ?? "");
  const [cWeb, setCWeb] = useState(settings.website ?? "");
  const [cIndustry, setCIndustry] = useState(settings.industry ?? "");

  const [iCName, setICName] = useState(settings.company_name);
  const [iCTrade, setICTrade] = useState(settings.trade_license_number ?? "");
  const [iCLogo, setICLogo] = useState<string | null>(settings.logo_url);
  const [iCAddr, setICAddr] = useState(settings.registered_address ?? "");
  const [iCEmirate, setICEmirate] = useState(settings.home_emirate ?? "");
  const [iCCountry, setICCountry] = useState(settings.country);
  const [iCPhone, setCIPhone] = useState(settings.phone ?? "");
  const [iCEmail, setICEmail] = useState(settings.email ?? "");
  const [iCWeb, setICWeb] = useState(settings.website ?? "");
  const [iCIndustry, setICIndustry] = useState(settings.industry ?? "");

  const dirtyCompany =
    cName !== iCName ||
    cTrade !== iCTrade ||
    cLogo !== iCLogo ||
    cAddr !== iCAddr ||
    cEmirate !== iCEmirate ||
    cCountry !== iCCountry ||
    cPhone !== iCPhone ||
    cEmail !== iCEmail ||
    cWeb !== iCWeb ||
    cIndustry !== iCIndustry;

  // —— Tax ——
  const [vatReg, setVatReg] = useState(settings.vat_registered);
  const [trn, setTrn] = useState(settings.trn ?? "");
  const [vatEff, setVatEff] = useState(settings.vat_effective_date ?? "");
  const [vatFreq, setVatFreq] = useState(settings.vat_filing_frequency);
  const [vatFirst, setVatFirst] = useState(settings.first_vat_period_start ?? "");
  const [revCharge, setRevCharge] = useState(settings.reverse_charge_enabled);
  const [zeroRated, setZeroRated] = useState<string[]>(asStringArray(settings.zero_rated_categories));
  const [exempt, setExempt] = useState<string[]>(asStringArray(settings.exempt_categories));

  const [iVatReg, setIVatReg] = useState(settings.vat_registered);
  const [iTrn, setITrn] = useState(settings.trn ?? "");
  const [iVatEff, setIVatEff] = useState(settings.vat_effective_date ?? "");
  const [iVatFreq, setIVatFreq] = useState(settings.vat_filing_frequency);
  const [iVatFirst, setIVatFirst] = useState(settings.first_vat_period_start ?? "");
  const [iRevCharge, setIRevCharge] = useState(settings.reverse_charge_enabled);
  const [iZeroRated, setIZeroRated] = useState<string[]>(asStringArray(settings.zero_rated_categories));
  const [iExempt, setIExempt] = useState<string[]>(asStringArray(settings.exempt_categories));

  const dirtyTax =
    vatReg !== iVatReg ||
    trn !== iTrn ||
    vatEff !== iVatEff ||
    vatFreq !== iVatFreq ||
    vatFirst !== iVatFirst ||
    revCharge !== iRevCharge ||
    dirtyJson(zeroRated, iZeroRated) ||
    dirtyJson(exempt, iExempt);

  // —— Accounting ——
  const [fyMonth, setFyMonth] = useState(settings.fiscal_year_start_month);
  const [baseCur, setBaseCur] = useState(settings.base_currency);
  const [symPos, setSymPos] = useState(settings.currency_symbol_position);
  const [decSep, setDecSep] = useState(settings.currency_decimal_separator);
  const [thSep, setThSep] = useState(settings.currency_thousand_separator);
  const [invVal, setInvVal] = useState(settings.inventory_valuation_method);
  const [negStock, setNegStock] = useState(settings.allow_negative_stock);
  const [capTh, setCapTh] = useState(String(settings.capitalization_threshold));
  const [depMet, setDepMet] = useState(settings.default_depreciation_method);
  const [defRevCode, setDefRevCode] = useState(settings.deferred_revenue_account_code);
  const [monthEnd, setMonthEnd] = useState(settings.month_end_recognition_day);
  const [autoMonth, setAutoMonth] = useState(settings.auto_run_month_end_recognition);
  const [lifeRows, setLifeRows] = useState(
    usefulLife.map((r) => ({ id: r.id, category: r.category, life_years: r.life_years })),
  );

  const [iFyMonth, setIFyMonth] = useState(settings.fiscal_year_start_month);
  const [iBaseCur, setIBaseCur] = useState(settings.base_currency);
  const [iSymPos, setISymPos] = useState(settings.currency_symbol_position);
  const [iDecSep, setIDecSep] = useState(settings.currency_decimal_separator);
  const [iThSep, setIThSep] = useState(settings.currency_thousand_separator);
  const [iInvVal, setIInvVal] = useState(settings.inventory_valuation_method);
  const [iNegStock, setINegStock] = useState(settings.allow_negative_stock);
  const [iCapTh, setICapTh] = useState(String(settings.capitalization_threshold));
  const [iDepMet, setIDepMet] = useState(settings.default_depreciation_method);
  const [iDefRevCode, setIDefRevCode] = useState(settings.deferred_revenue_account_code);
  const [iMonthEnd, setIMonthEnd] = useState(settings.month_end_recognition_day);
  const [iAutoMonth, setIAutoMonth] = useState(settings.auto_run_month_end_recognition);
  const [iLifeRows, setILifeRows] = useState(
    usefulLife.map((r) => ({ id: r.id, category: r.category, life_years: r.life_years })),
  );

  const dirtyAccounting =
    fyMonth !== iFyMonth ||
    baseCur !== iBaseCur ||
    symPos !== iSymPos ||
    decSep !== iDecSep ||
    thSep !== iThSep ||
    invVal !== iInvVal ||
    negStock !== iNegStock ||
    capTh !== iCapTh ||
    depMet !== iDepMet ||
    defRevCode !== iDefRevCode ||
    monthEnd !== iMonthEnd ||
    autoMonth !== iAutoMonth ||
    dirtyJson(lifeRows, iLifeRows);

  // —— Approval ——
  const [reqAppr, setReqAppr] = useState(settings.require_approval_before_posting);
  const [minAppr, setMinAppr] = useState(settings.minimum_approvers);
  const [apprAmt, setApprAmt] = useState(
    settings.approval_amount_threshold != null ? String(settings.approval_amount_threshold) : "",
  );
  const [notifyDrafter, setNotifyDrafter] = useState(settings.auto_notify_drafter_on_approval);

  const [iReqAppr, setIReqAppr] = useState(settings.require_approval_before_posting);
  const [iMinAppr, setIMinAppr] = useState(settings.minimum_approvers);
  const [iApprAmt, setIApprAmt] = useState(
    settings.approval_amount_threshold != null ? String(settings.approval_amount_threshold) : "",
  );
  const [iNotifyDrafter, setINotifyDrafter] = useState(settings.auto_notify_drafter_on_approval);

  const dirtyApproval =
    reqAppr !== iReqAppr ||
    minAppr !== iMinAppr ||
    apprAmt !== iApprAmt ||
    notifyDrafter !== iNotifyDrafter;

  // —— Reports ——
  const [cmpPer, setCmpPer] = useState(settings.default_comparison_period);
  const [dateRng, setDateRng] = useState(settings.default_date_range);
  const [hideUnder, setHideUnder] = useState(String(settings.hide_rows_under_amount));
  const [matAbs, setMatAbs] = useState(String(settings.material_change_absolute));
  const [matPct, setMatPct] = useState(String(settings.material_change_percentage));
  const [plRev, setPlRev] = useState(settings.default_pl_revenue_view);
  const [grossM, setGrossM] = useState(settings.show_gross_margin_percent);
  const [netM, setNetM] = useState(settings.show_net_margin_percent);

  const [iCmpPer, setICmpPer] = useState(settings.default_comparison_period);
  const [iDateRng, setIDateRng] = useState(settings.default_date_range);
  const [iHideUnder, setIHideUnder] = useState(String(settings.hide_rows_under_amount));
  const [iMatAbs, setIMatAbs] = useState(String(settings.material_change_absolute));
  const [iMatPct, setIMatPct] = useState(String(settings.material_change_percentage));
  const [iPlRev, setIPlRev] = useState(settings.default_pl_revenue_view);
  const [iGrossM, setIGrossM] = useState(settings.show_gross_margin_percent);
  const [iNetM, setINetM] = useState(settings.show_net_margin_percent);

  const dirtyReports =
    cmpPer !== iCmpPer ||
    dateRng !== iDateRng ||
    hideUnder !== iHideUnder ||
    matAbs !== iMatAbs ||
    matPct !== iMatPct ||
    plRev !== iPlRev ||
    grossM !== iGrossM ||
    netM !== iNetM;

  const anyDirty =
    dirtyCompany || dirtyTax || dirtyAccounting || dirtyApproval || dirtyReports;

  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  useEffect(() => {
    if (!anyDirty) return;
    const onDocClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("a[href]");
      if (!el) return;
      const href = (el as HTMLAnchorElement).href;
      if (!href) return;
      try {
        const u = new URL(href);
        if (u.origin !== window.location.origin) return;
        if (u.pathname === window.location.pathname) return;
        if (!window.confirm("You have unsaved changes. Leave without saving?")) {
          e.preventDefault();
          e.stopPropagation();
        }
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [anyDirty]);

  const scrollTo = (id: string) => {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.1, 0.25, 0.5] },
    );
    SETTINGS_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const toggleMulti = (list: string[], setList: (v: string[]) => void, value: string, checked: boolean) => {
    if (checked) setList([...new Set([...list, value])]);
    else setList(list.filter((x) => x !== value));
  };

  const saveCompany = () => {
    startTransition(async () => {
      try {
        await saveCompanyProfileSectionAction({
          company_name: cName,
          trade_license_number: cTrade || null,
          logo_url: cLogo,
          registered_address: cAddr || null,
          home_emirate:
            cEmirate === ""
              ? null
              : (cEmirate as "Abu Dhabi" | "Dubai" | "Sharjah" | "Ajman" | "UAQ" | "RAK" | "Fujairah"),
          country: cCountry,
          phone: cPhone || null,
          email: cEmail,
          website: cWeb,
          industry: cIndustry || null,
        });
        setICName(cName);
        setICTrade(cTrade);
        setICLogo(cLogo);
        setICAddr(cAddr);
        setICEmirate(cEmirate);
        setICCountry(cCountry);
        setCIPhone(cPhone);
        setICEmail(cEmail);
        setICWeb(cWeb);
        setICIndustry(cIndustry);
        toast.success("Company details saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const saveTax = () => {
    startTransition(async () => {
      try {
        await saveTaxSectionAction({
          vat_registered: vatReg,
          trn: trn || null,
          vat_effective_date: vatEff || null,
          vat_filing_frequency: vatFreq as "monthly" | "quarterly",
          first_vat_period_start: vatFirst || null,
          reverse_charge_enabled: revCharge,
          zero_rated_categories: zeroRated,
          exempt_categories: exempt,
        });
        setIVatReg(vatReg);
        setITrn(trn);
        setIVatEff(vatEff);
        setIVatFreq(vatFreq);
        setIVatFirst(vatFirst);
        setIRevCharge(revCharge);
        setIZeroRated([...zeroRated]);
        setIExempt([...exempt]);
        toast.success("Tax settings saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const saveAccounting = () => {
    const cap = Number(capTh);
    if (Number.isNaN(cap) || cap <= 0) {
      toast.error("Capitalization threshold must be a positive number");
      return;
    }
    startTransition(async () => {
      try {
        await saveAccountingSectionAction({
          fiscal_year_start_month: fyMonth,
          base_currency: baseCur,
          currency_symbol_position: symPos as "prefix" | "suffix",
          currency_decimal_separator: decSep,
          currency_thousand_separator: thSep,
          inventory_valuation_method: invVal as "fifo" | "weighted_average" | "specific_identification",
          allow_negative_stock: negStock,
          default_warehouse_id: null,
          capitalization_threshold: cap,
          default_depreciation_method: depMet as "straight_line" | "reducing_balance",
          deferred_revenue_account_code: defRevCode,
          month_end_recognition_day: monthEnd as "first_of_next" | "last_of_current",
          auto_run_month_end_recognition: autoMonth,
          useful_life_rows: lifeRows,
        });
        setIFyMonth(fyMonth);
        setIBaseCur(baseCur);
        setISymPos(symPos);
        setIDecSep(decSep);
        setIThSep(thSep);
        setIInvVal(invVal);
        setINegStock(negStock);
        setICapTh(capTh);
        setIDepMet(depMet);
        setIDefRevCode(defRevCode);
        setIMonthEnd(monthEnd);
        setIAutoMonth(autoMonth);
        setILifeRows(lifeRows.map((r) => ({ ...r })));
        toast.success("Accounting preferences saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const saveApproval = () => {
    startTransition(async () => {
      try {
        const th = apprAmt.trim() === "" ? null : Number(apprAmt);
        if (th != null && (Number.isNaN(th) || th < 0)) {
          toast.error("Invalid approval amount threshold");
          return;
        }
        await saveApprovalSectionAction({
          require_approval_before_posting: reqAppr,
          minimum_approvers: minAppr,
          approval_amount_threshold: th,
          auto_notify_drafter_on_approval: notifyDrafter,
        });
        setIReqAppr(reqAppr);
        setIMinAppr(minAppr);
        setIApprAmt(apprAmt);
        setINotifyDrafter(notifyDrafter);
        toast.success("Approval settings saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const saveReports = () => {
    startTransition(async () => {
      try {
        await saveReportsSectionAction({
          default_comparison_period: cmpPer as "prior_period" | "prior_year" | "none",
          default_date_range: dateRng as "this_month" | "this_quarter" | "ytd",
          hide_rows_under_amount: Number(hideUnder) || 0,
          material_change_absolute: Number(matAbs) || 0,
          material_change_percentage: Number(matPct) || 0,
          default_pl_revenue_view: plRev as "recognized" | "billed" | "cash_collected",
          show_gross_margin_percent: grossM,
          show_net_margin_percent: netM,
        });
        setICmpPer(cmpPer);
        setIDateRng(dateRng);
        setIHideUnder(hideUnder);
        setIMatAbs(matAbs);
        setIMatPct(matPct);
        setIPlRev(plRev);
        setIGrossM(grossM);
        setINetM(netM);
        toast.success("Report preferences saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const onLogo = useCallback((file: File | null) => {
    if (!file) {
      setCLogo(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be 2MB or smaller");
      return;
    }
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Use PNG or JPG");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCLogo(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }, []);

  const baseCurWarn = useMemo(() => baseCur !== iBaseCur && hasTransactions, [baseCur, iBaseCur, hasTransactions]);

  const disabled = !canManage || pending;

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <nav className="lg:w-56 shrink-0 space-y-1 lg:sticky lg:top-20">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Sections</p>
        {SETTINGS_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollTo(s.id)}
            className={cn(
              "flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors",
              activeId === s.id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 space-y-10">
        {!canManage && (
          <Alert>
            <AlertTitle>View only</AlertTitle>
            <AlertDescription>Only workspace administrators can change company settings.</AlertDescription>
          </Alert>
        )}

        <section id="company-profile" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Company Profile</h2>
            {dirtyCompany && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>
            )}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Company details</CardTitle>
              <CardDescription>Legal identity and contact information shown on documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Company name *</Label>
                  <Input value={cName} onChange={(e) => setCName(e.target.value)} disabled={disabled} />
                </div>
                <div className="space-y-2">
                  <Label>Trade license number</Label>
                  <Input value={cTrade} onChange={(e) => setCTrade(e.target.value)} disabled={disabled} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Logo (PNG/JPG, max 2MB)</Label>
                <Input
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={disabled}
                  onChange={(e) => onLogo(e.target.files?.[0] ?? null)}
                />
                {cLogo ? (
                  <p className="text-xs text-muted-foreground">Logo set — appears on printed documents.</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Registered address</Label>
                <Textarea value={cAddr} onChange={(e) => setCAddr(e.target.value)} rows={3} disabled={disabled} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Home emirate (VAT)</Label>
                  <Select value={cEmirate || "none"} onValueChange={(v) => setCEmirate(v === "none" ? "" : v)} disabled={disabled}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select emirate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      {UAE_EMIRATES.map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={cCountry} onValueChange={setCCountry} disabled={disabled}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AE">United Arab Emirates (AE)</SelectItem>
                      <SelectItem value="SA">Saudi Arabia</SelectItem>
                      <SelectItem value="GB">United Kingdom</SelectItem>
                      <SelectItem value="US">United States</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} disabled={disabled} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={cEmail} onChange={(e) => setCEmail(e.target.value)} disabled={disabled} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={cWeb}
                    onChange={(e) => setCWeb(e.target.value)}
                    placeholder="https://"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Select value={cIndustry || "none"} onValueChange={(v) => setCIndustry(v === "none" ? "" : v)} disabled={disabled}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      {UAE_INDUSTRIES.map((i) => (
                        <SelectItem key={i} value={i}>
                          {i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={saveCompany} disabled={disabled || !dirtyCompany}>
                Save company details
              </Button>
            </CardFooter>
          </Card>
        </section>

        <section id="tax-compliance" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Tax &amp; Compliance</h2>
            {dirtyTax && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>
            )}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>VAT</CardTitle>
              <CardDescription>UAE VAT registration and filing preferences.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">VAT registration</p>
                  <p className="text-sm text-muted-foreground">Registered for UAE VAT with the FTA</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input"
                  checked={vatReg}
                  onChange={(e) => setVatReg(e.target.checked)}
                  disabled={disabled}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tax Registration Number (TRN)</Label>
                  <Input
                    value={trn}
                    onChange={(e) => setTrn(e.target.value.replace(/\D/g, "").slice(0, 15))}
                    placeholder="15 digits"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>VAT effective date</Label>
                  <Input type="date" value={vatEff?.slice(0, 10) ?? ""} onChange={(e) => setVatEff(e.target.value)} disabled={disabled} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>VAT filing frequency</Label>
                  <Select value={vatFreq} onValueChange={setVatFreq} disabled={disabled}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The FTA assigns most businesses quarterly filing. Monthly is for larger businesses. Check your FTA portal if
                    unsure.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>First VAT period start</Label>
                  <Input type="date" value={vatFirst?.slice(0, 10) ?? ""} onChange={(e) => setVatFirst(e.target.value)} disabled={disabled} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Standard VAT rate (UAE)</Label>
                <Input value="5%" readOnly disabled className="max-w-xs bg-muted" />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">Reverse charge</p>
                  <p className="text-sm text-muted-foreground">Apply reverse charge where applicable</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input"
                  checked={revCharge}
                  onChange={(e) => setRevCharge(e.target.checked)}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Zero-rated categories</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ZERO_RATED_VAT_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border border-input"
                        checked={zeroRated.includes(opt)}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          toggleMulti(zeroRated, setZeroRated, opt, e.target.checked)
                        }
                        disabled={disabled}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Exempt categories</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {EXEMPT_VAT_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border border-input"
                        checked={exempt.includes(opt)}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          toggleMulti(exempt, setExempt, opt, e.target.checked)
                        }
                        disabled={disabled}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={saveTax} disabled={disabled || !dirtyTax}>
                Save tax settings
              </Button>
            </CardFooter>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Transaction tax rates</CardTitle>
                <CardDescription>Rates used on drafts and invoices (separate from registration above).</CardDescription>
              </CardHeader>
              <CardContent>
                <TaxRatesForm />
              </CardContent>
            </Card>
          ) : null}
        </section>

        <section id="accounting-preferences" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Accounting Preferences</h2>
            {dirtyAccounting && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>
            )}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Fiscal year</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-w-xs">
              <Label>Fiscal year starts (month)</Label>
              <Select
                value={String(fyMonth)}
                onValueChange={(v) => setFyMonth(Number(v))}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {new Date(2000, m - 1, 1).toLocaleString("en", { month: "long" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Most UAE businesses use the calendar year. Change only if your fiscal year differs.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Base currency &amp; display</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {baseCurWarn && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Changing base currency</AlertTitle>
                  <AlertDescription>
                    Historical transactions are not revalued. Use only if you are correcting an initial setup mistake.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Base currency</Label>
                  <Select value={baseCur} onValueChange={setBaseCur} disabled={disabled}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AED">AED — UAE Dirham</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Symbol position</Label>
                  <Select value={symPos} onValueChange={setSymPos} disabled={disabled}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prefix">Prefix (AED 100)</SelectItem>
                      <SelectItem value="suffix">Suffix (100 AED)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Decimal separator</Label>
                  <Input value={decSep} onChange={(e) => setDecSep(e.target.value.slice(0, 1))} maxLength={1} disabled={disabled} />
                </div>
                <div className="space-y-2">
                  <Label>Thousand separator</Label>
                  <Input value={thSep} onChange={(e) => setThSep(e.target.value.slice(0, 1))} maxLength={1} disabled={disabled} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-md">
                <Label>Default inventory valuation</Label>
                <Select value={invVal} onValueChange={setInvVal} disabled={disabled}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fifo">FIFO</SelectItem>
                    <SelectItem value="weighted_average">Weighted Average (WAC)</SelectItem>
                    <SelectItem value="specific_identification">Specific Identification</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">Allow negative stock</p>
                  <p className="text-sm text-muted-foreground">When off, sales are blocked if insufficient stock</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input"
                  checked={negStock}
                  onChange={(e) => setNegStock(e.target.checked)}
                  disabled={disabled}
                />
              </div>
              <p className="text-xs text-muted-foreground">Default warehouse: not configured (no warehouses in this workspace yet).</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fixed assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-xs">
                <Label>Capitalization threshold (AED)</Label>
                <Input value={capTh} onChange={(e) => setCapTh(e.target.value)} disabled={disabled} />
                <p className="text-xs text-muted-foreground">Items below this amount are treated as expenses, not assets.</p>
              </div>
              <div className="space-y-2 max-w-md">
                <Label>Default depreciation method</Label>
                <Select value={depMet} onValueChange={setDepMet} disabled={disabled}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straight_line">Straight-line</SelectItem>
                    <SelectItem value="reducing_balance">Reducing balance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default useful life by category</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="w-32">Years</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lifeRows.map((row, idx) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.category}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={row.life_years}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              const next = [...lifeRows];
                              next[idx] = { ...row, life_years: Number.isNaN(v) ? row.life_years : v };
                              setLifeRows(next);
                            }}
                            disabled={disabled}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deferred revenue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>Deferred revenue account code</Label>
                <Input value={defRevCode} onChange={(e) => setDefRevCode(e.target.value)} disabled={disabled} />
                <p className="text-xs text-muted-foreground">Must exist in Chart of Accounts as a liability account.</p>
              </div>
              <div className="space-y-2">
                <Label>Month-end recognition</Label>
                <Select value={monthEnd} onValueChange={setMonthEnd} disabled={disabled}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_of_next">1st of next month</SelectItem>
                    <SelectItem value="last_of_current">Last day of current month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">Auto-run month-end recognition</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input"
                  checked={autoMonth}
                  onChange={(e) => setAutoMonth(e.target.checked)}
                  disabled={disabled}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={saveAccounting} disabled={disabled || !dirtyAccounting}>
                Save accounting preferences
              </Button>
            </CardFooter>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Accounting period close</CardTitle>
                <CardDescription>Block posting for dates on or before the closed-through date.</CardDescription>
              </CardHeader>
              <CardContent>
                <PeriodCloseForm defaultClosedThrough={periodClosedThrough} />
              </CardContent>
            </Card>
          ) : null}
        </section>

        <section id="approval-workflow" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Approval Workflow</h2>
            {dirtyApproval && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>
            )}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Journal approvals</CardTitle>
              <CardDescription>
                When enabled, a second user must approve each entry before it can post. Recommended for teams with segregation of
                duties requirements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">Require approval before posting journal entries</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input"
                  checked={reqAppr}
                  onChange={(e) => setReqAppr(e.target.checked)}
                  disabled={disabled}
                />
              </div>
              {reqAppr ? (
                <>
                  <div className="flex items-center justify-between gap-4 rounded-lg border p-4 opacity-80">
                    <div>
                      <p className="font-medium">Drafter cannot self-approve</p>
                      <p className="text-sm text-muted-foreground">Required for segregation of duties</p>
                    </div>
                    <input type="checkbox" className="h-4 w-4 rounded border border-input" checked readOnly disabled />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 max-w-md">
                    <div className="space-y-2">
                      <Label>Minimum approvers</Label>
                      <Select
                        value={String(minAppr)}
                        onValueChange={(v) => setMinAppr(Number(v))}
                        disabled={disabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount threshold for extra approval (optional)</Label>
                      <Input value={apprAmt} onChange={(e) => setApprAmt(e.target.value)} placeholder="AED" disabled={disabled} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div>
                      <p className="font-medium">Notify drafter when approved or rejected</p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border border-input"
                      checked={notifyDrafter}
                      onChange={(e) => setNotifyDrafter(e.target.checked)}
                      disabled={disabled}
                    />
                  </div>
                </>
              ) : null}
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={saveApproval} disabled={disabled || !dirtyApproval}>
                Save approval settings
              </Button>
            </CardFooter>
          </Card>
        </section>

        <section id="reports-preferences" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Reports Preferences</h2>
            {dirtyReports && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>
            )}
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Default comparison period</Label>
                  <Select value={cmpPer} onValueChange={setCmpPer} disabled={disabled}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prior_period">Prior period</SelectItem>
                      <SelectItem value="prior_year">Prior year</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Default date range</Label>
                  <Select value={dateRng} onValueChange={setDateRng} disabled={disabled}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="this_month">This month</SelectItem>
                      <SelectItem value="this_quarter">This quarter</SelectItem>
                      <SelectItem value="ytd">Year to date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2 max-w-xs">
                <Label>Hide rows under (AED)</Label>
                <Input value={hideUnder} onChange={(e) => setHideUnder(e.target.value)} disabled={disabled} />
                <p className="text-xs text-muted-foreground">Useful for cleaner reports when you have many small accounts.</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-2">Material change thresholds (variance highlighting)</p>
                <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
                  <div className="space-y-2">
                    <Label>Absolute (AED)</Label>
                    <Input value={matAbs} onChange={(e) => setMatAbs(e.target.value)} disabled={disabled} />
                  </div>
                  <div className="space-y-2">
                    <Label>Percentage (%)</Label>
                    <Input value={matPct} onChange={(e) => setMatPct(e.target.value)} disabled={disabled} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  A row is flagged as materially changed only when both thresholds are exceeded.
                </p>
              </div>
              <div className="space-y-2 max-w-md">
                <Label>Revenue view default on P&amp;L</Label>
                <Select value={plRev} onValueChange={setPlRev} disabled={disabled}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recognized">Recognized</SelectItem>
                    <SelectItem value="billed">Billed</SelectItem>
                    <SelectItem value="cash_collected">Cash collected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">Show gross margin % on P&amp;L</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input"
                  checked={grossM}
                  onChange={(e) => setGrossM(e.target.checked)}
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">Show net margin % on P&amp;L</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input"
                  checked={netM}
                  onChange={(e) => setNetM(e.target.checked)}
                  disabled={disabled}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={saveReports} disabled={disabled || !dirtyReports}>
                Save report preferences
              </Button>
            </CardFooter>
          </Card>
        </section>

        <section id="users-roles" className="scroll-mt-24 space-y-4">
          <h2 className="text-lg font-semibold">Users &amp; Roles</h2>
          <Card>
            <CardHeader>
              <CardTitle>Coming soon</CardTitle>
              <CardDescription>
                User and role management is coming soon. For now, you are the only user of this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" size="sm" asChild>
                <a href="https://cursor.com/docs" target="_blank" rel="noopener noreferrer">
                  Learn more <ExternalLink className="ml-1 h-3 w-3 inline" />
                </a>
              </Button>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>{currentUser.email}</TableCell>
                    <TableCell className="capitalize">{currentUser.role}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        <section id="integrations" className="scroll-mt-24 space-y-4">
          <h2 className="text-lg font-semibold">Integrations</h2>
          <Card>
            <CardHeader>
              <CardTitle>Coming soon</CardTitle>
              <CardDescription>
                Integrations with bank feeds, payment processors, and other tools are coming soon.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Current integrations: None.</p>
            </CardContent>
          </Card>
        </section>

        <SubscriptionManager
          plans={subscriptionBundle.plans}
          subscription={subscriptionBundle.subscription}
          usage={subscriptionBundle.usage}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
