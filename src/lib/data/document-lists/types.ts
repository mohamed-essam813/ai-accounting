import { z } from "zod";

export const documentStatusFilterSchema = z.enum([
  "all",
  "draft",
  "pending_approval",
  "approved",
  "posted",
  "voided",
  "reversed",
]);

export type DocumentStatusFilter = z.infer<typeof documentStatusFilterSchema>;

export const invoiceListQuerySchema = z.object({
  status: documentStatusFilterSchema.default("all"),
  startDate: z.string(),
  endDate: z.string(),
  counterpartyIds: z.array(z.string().uuid()).optional().default([]),
  search: z.string().optional().default(""),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  createdBy: z.string().uuid().optional(),
  overdue: z.enum(["yes", "no", "any"]).optional().default("any"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["date", "total", "number"]).default("date"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const billListQuerySchema = invoiceListQuerySchema.extend({
  hasBillNumber: z.enum(["yes", "no", "any"]).optional().default("any"),
});

export type BillListQuery = z.infer<typeof billListQuerySchema>;

export const paymentListQuerySchema = z.object({
  status: documentStatusFilterSchema.default("all"),
  direction: z.enum(["all", "in", "out"]).default("all"),
  startDate: z.string(),
  endDate: z.string(),
  counterpartyIds: z.array(z.string().uuid()).optional().default([]),
  search: z.string().optional().default(""),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  createdBy: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["date", "amount"]).default("date"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
