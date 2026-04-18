import { thisMonthPreset } from "@/lib/reports/report-date-defaults";
import {
  billListQuerySchema,
  invoiceListQuerySchema,
  paymentListQuerySchema,
  type BillListQuery,
  type InvoiceListQuery,
  type PaymentListQuery,
} from "@/lib/data/document-lists/types";

function splitIds(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function parseInvoiceListQuery(sp: URLSearchParams): InvoiceListQuery {
  const fallback = thisMonthPreset();
  return invoiceListQuerySchema.parse({
    status: sp.get("status") ?? "all",
    startDate: sp.get("startDate") || fallback.startDate,
    endDate: sp.get("endDate") || fallback.endDate,
    counterpartyIds: splitIds(sp.get("counterpartyIds")),
    search: sp.get("search") ?? "",
    amountMin: sp.get("amountMin") ?? undefined,
    amountMax: sp.get("amountMax") ?? undefined,
    createdBy: sp.get("createdBy") ?? undefined,
    overdue: sp.get("overdue") ?? "any",
    page: sp.get("page") ?? "1",
    pageSize: sp.get("pageSize") ?? "50",
    sort: sp.get("sort") ?? "date",
    sortDir: sp.get("sortDir") ?? "desc",
  });
}

export function parseBillListQuery(sp: URLSearchParams): BillListQuery {
  const fallback = thisMonthPreset();
  return billListQuerySchema.parse({
    status: sp.get("status") ?? "all",
    startDate: sp.get("startDate") || fallback.startDate,
    endDate: sp.get("endDate") || fallback.endDate,
    counterpartyIds: splitIds(sp.get("counterpartyIds")),
    search: sp.get("search") ?? "",
    amountMin: sp.get("amountMin") ?? undefined,
    amountMax: sp.get("amountMax") ?? undefined,
    createdBy: sp.get("createdBy") ?? undefined,
    overdue: sp.get("overdue") ?? "any",
    hasBillNumber: sp.get("hasBillNumber") ?? "any",
    page: sp.get("page") ?? "1",
    pageSize: sp.get("pageSize") ?? "50",
    sort: sp.get("sort") ?? "date",
    sortDir: sp.get("sortDir") ?? "desc",
  });
}

export function parsePaymentListQuery(sp: URLSearchParams): PaymentListQuery {
  const fallback = thisMonthPreset();
  return paymentListQuerySchema.parse({
    status: sp.get("status") ?? "all",
    direction: sp.get("direction") ?? "all",
    startDate: sp.get("startDate") || fallback.startDate,
    endDate: sp.get("endDate") || fallback.endDate,
    counterpartyIds: splitIds(sp.get("counterpartyIds")),
    search: sp.get("search") ?? "",
    amountMin: sp.get("amountMin") ?? undefined,
    amountMax: sp.get("amountMax") ?? undefined,
    createdBy: sp.get("createdBy") ?? undefined,
    page: sp.get("page") ?? "1",
    pageSize: sp.get("pageSize") ?? "50",
    sort: sp.get("sort") ?? "date",
    sortDir: sp.get("sortDir") ?? "desc",
  });
}
