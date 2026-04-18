import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/users";
import { getCompanySettings } from "@/lib/data/company-settings";
import { isReportApiSlug, type ReportApiSlug } from "@/lib/reports/report-api-types";
import { isFutureDateOnly } from "@/lib/reports/period-windows";
import { getCachedReport } from "@/lib/reports/reports-cache";
import { resolvePnlCompareRanges, type PnlCompareMode } from "@/lib/reports/report-comparison-resolver";
import { computePnlForRanges } from "@/lib/reports/pnl-compute";

const postBody = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    comparison: z
      .enum(["none", "prior_period", "prior_year", "custom", "budget"])
      .optional()
      .default("prior_period"),
    compareStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    compareEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => d.startDate <= d.endDate, { path: ["endDate"], message: "start must be on or before end" })
  .refine((d) => !isFutureDateOnly(d.endDate), { path: ["endDate"], message: "end date cannot be in the future" })
  .refine(
    (d) => d.comparison !== "custom" || (Boolean(d.compareStart) && Boolean(d.compareEnd)),
    { path: ["compareStart"], message: "Custom comparison requires compareStart and compareEnd" },
  )
  .refine(
    (d) =>
      !d.compareStart || !d.compareEnd || d.compareStart <= d.compareEnd,
    { path: ["compareEnd"], message: "Compare start must be on or before compare end" },
  )
  .refine(
    (d) => d.comparison !== "budget",
    { path: ["comparison"], message: "Budget comparison is not available yet" },
  )
  .refine(
    (d) => !d.compareStart || !isFutureDateOnly(d.compareStart),
    { path: ["compareStart"], message: "Compare start cannot be in the future" },
  )
  .refine(
    (d) => !d.compareEnd || !isFutureDateOnly(d.compareEnd),
    { path: ["compareEnd"], message: "Compare end cannot be in the future" },
  );

function mapMode(j: z.infer<typeof postBody>): PnlCompareMode {
  if (j.comparison === "none") return "none";
  if (j.comparison === "custom") return "custom";
  if (j.comparison === "prior_year") return "prior_year";
  return "prior_period";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportType: string }> },
) {
  let body: z.infer<typeof postBody>;
  try {
    const json: unknown = await request.json();
    body = postBody.parse(json);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ") },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportType } = await params;
  if (!isReportApiSlug(reportType)) {
    return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user?.tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = user.tenant.id;
  const settings = await getCompanySettings();
  const matAbs = settings?.material_change_absolute ?? 1000;
  const matPct = settings?.material_change_percentage ?? 20;
  const minBothSmall = Math.max(10, Number(settings?.hide_rows_under_amount) || 0);

  if (reportType === "pnl" as ReportApiSlug) {
    const mode = mapMode(body);
    const r = resolvePnlCompareRanges(
      body.startDate,
      body.endDate,
      mode,
      body.compareStart,
      body.compareEnd,
    );
    const payload = await getCachedReport(
      [
        tenantId,
        "pnl",
        body.startDate,
        body.endDate,
        r.withComparison ? "1" : "0",
        r.compareStart,
        r.compareEnd,
        String(matAbs),
        String(matPct),
        String(minBothSmall),
        JSON.stringify(body.filters ?? {}),
      ],
      () =>
        computePnlForRanges({
          tenantId,
          startDate: body.startDate,
          endDate: body.endDate,
          compareStart: r.compareStart,
          compareEnd: r.compareEnd,
          withComparison: r.withComparison,
          matAbs,
          matPct,
          minBothSmall,
        }),
    );
    return NextResponse.json({ report: "pnl", data: payload });
  }

  return NextResponse.json({ error: "Report not implemented yet" }, { status: 501 });
}
