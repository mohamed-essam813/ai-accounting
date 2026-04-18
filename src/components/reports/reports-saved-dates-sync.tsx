"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  REPORT_DATE_STORAGE_KEY,
  defaultDateRangeForTab,
  rangesMatch,
  type ReportTabId,
  type StoredReportDateRanges,
} from "@/lib/reports/report-date-defaults";

/**
 * After server redirect fills default dates, restore the user's last saved range for this tab when it
 * differs from the tab default (does not override URLs that already differ from defaults — e.g. shared links).
 */
export function ReportsSavedDatesSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const tab = (searchParams.get("tab") || "pnl") as ReportTabId;
    const start = searchParams.get("startDate");
    const end = searchParams.get("endDate");
    if (!start || !end) return;

    let stored: StoredReportDateRanges = {};
    try {
      const raw = localStorage.getItem(REPORT_DATE_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as StoredReportDateRanges;
    } catch {
      return;
    }
    const saved = stored[tab];
    if (!saved?.startDate || !saved?.endDate) return;

    const def = defaultDateRangeForTab(tab);
    const urlRange = { startDate: start, endDate: end };
    if (!rangesMatch(urlRange, def)) return;
    if (rangesMatch(urlRange, saved)) return;

    const p = new URLSearchParams(searchParams.toString());
    p.set("startDate", saved.startDate);
    p.set("endDate", saved.endDate);
    router.replace(`/reports/pnl?${p.toString()}`);
  }, [router, searchParams]);

  return null;
}
