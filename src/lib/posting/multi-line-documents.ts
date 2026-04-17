import { z } from "zod";
import type { Account } from "@/lib/accounting";
import type { JournalLine } from "@/lib/accounting";
import { ensureBalanced } from "@/lib/accounting";
import { getBusinessItemById } from "@/lib/data/inventory";
import type { TaxRate } from "@/lib/data/tax-rates";
import { computeVatFromRate, round2 } from "@/lib/posting/posting-engine";
import type { TaxTreatment } from "@/lib/posting/posting-engine";
import type { DraftInventoryLine } from "@/lib/posting/materialize-amounts";

const AssetLineDraftSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string().default(""),
  serialNumber: z.string().default(""),
  location: z.string().default(""),
  costOverride: z.string().default(""),
});

const AssetLineSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  asset_account_id: z.string().uuid(),
  useful_life_years: z.number().int().positive(),
  depreciation_method: z.enum(["straight_line", "reducing_balance", "units_of_production", "none"]),
  // Extended fields for fixed asset register
  residual_value: z.number().nonnegative().optional(),
  start_depreciation_date: z.string().optional(),
  serial_number: z.string().optional(),
  location: z.string().optional(),
  assigned_to: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  depreciation_method_raw: z.string().optional(),
  asset_drafts: z.array(AssetLineDraftSchema).optional(),
});

export const BillDocumentLineSchema = z.object({
  classification: z.enum(["inventory", "expense", "asset"]),
  description: z.string().min(1),
  /** Exclusive net before line tax */
  line_net: z.number().nonnegative(),
  tax_rate_id: z.string().uuid().nullable().optional(),
  item_id: z.string().uuid().optional(),
  quantity: z.number().positive().optional(),
  unit_price: z.number().nonnegative().optional(),
  expense_account_id: z.string().uuid().optional(),
  asset: AssetLineSchema.optional(),
});

export type BillDocumentLine = z.infer<typeof BillDocumentLineSchema>;

export const InvoiceDocumentLineSchema = z.object({
  line_type: z.enum(["product", "service"]),
  description: z.string().min(1),
  line_net: z.number().nonnegative(),
  tax_rate_id: z.string().uuid().nullable().optional(),
  item_id: z.string().uuid(),
  quantity: z.number().positive().optional(),
  unit_price: z.number().nonnegative().optional(),
});

export type InvoiceDocumentLine = z.infer<typeof InvoiceDocumentLineSchema>;

function taxPctMap(rates: TaxRate[], id: string | null | undefined): number {
  if (!id) return 0;
  const r = rates.find((x) => x.id === id);
  return r?.percentage ?? 0;
}

function memoBase(counterparty: string, date: string): string {
  return [`Counterparty: ${counterparty}`, `Date: ${date}`].filter(Boolean).join(" | ");
}

export type MultiLineBillPostingResult = {
  description: string;
  lines: JournalLine[];
  documentTotal: number;
  /** Inventory lines for purchase posting (balance + transactions only; journal already built). */
  inventoryLinesForPurchase: Array<DraftInventoryLine & { item_name: string }>;
  /** Per-line asset payloads when classification === asset */
  assetLines: Array<{ line_net: number; asset: z.infer<typeof AssetLineSchema> }>;
};

/**
 * Builds a balanced supplier bill with mixed inventory / expense / asset debits, one input VAT aggregate (by account), one AP credit.
 */
export async function buildMultiLineBillPostingContext(params: {
  lines: BillDocumentLine[];
  accounts: Account[];
  taxTreatment: TaxTreatment;
  counterparty: string;
  postingDate: string;
  taxRates: TaxRate[];
}): Promise<MultiLineBillPostingResult> {
  const { lines, accounts, taxTreatment, counterparty, postingDate, taxRates } = params;

  const ap = accounts.find((a) => a.code === "2000");
  if (!ap) throw new Error("Accounts payable (code 2000) is missing.");

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const memo = memoBase(counterparty, postingDate);
  const description = lines.map((l) => l.description).join("; ") || `Bill from ${counterparty}`;

  const journalLines: JournalLine[] = [];
  const inventoryLinesForPurchase: Array<DraftInventoryLine & { item_name: string }> = [];
  const assetLines: Array<{ line_net: number; asset: z.infer<typeof AssetLineSchema> }> = [];

  const vatDebitByAccount = new Map<string, number>();
  let totalGross = 0;

  for (const line of lines) {
    const pct = taxPctMap(taxRates, line.tax_rate_id ?? null);
    const cmp = computeVatFromRate(line.line_net, pct, taxTreatment);
    const lineTax = cmp.tax;
    const lineGross = cmp.gross;
    totalGross = round2(totalGross + lineGross);

    if (line.tax_rate_id && lineTax > 0) {
      const tr = taxRates.find((r) => r.id === line.tax_rate_id);
      const vatAcc = tr?.input_vat_account_id
        ? accountById.get(tr.input_vat_account_id)
        : null;
      if (!vatAcc) {
        throw new Error(
          `Purchase tax rate is missing an input VAT account mapping. Line: ${line.description.slice(0, 80)}`,
        );
      }
      vatDebitByAccount.set(vatAcc.id, round2((vatDebitByAccount.get(vatAcc.id) ?? 0) + lineTax));
    }

    if (line.classification === "inventory") {
      if (!line.item_id || !line.quantity || line.unit_price == null) {
        throw new Error(`Inventory line "${line.description}" needs a product, quantity, and unit price.`);
      }
      const item = await getBusinessItemById(line.item_id);
      if (!item || item.item_type !== "product" || !item.inventory_tracked) {
        throw new Error(`Select an inventory-tracked product for line "${line.description}".`);
      }
      const invAccId = item.inventory_account_id;
      if (!invAccId) {
        throw new Error(`Product "${item.name}" is missing an inventory account.`);
      }
      const invAcc = accountById.get(invAccId);
      if (!invAcc) throw new Error("Inventory account not found on chart.");

      journalLines.push({
        account_id: invAcc.id,
        debit: round2(cmp.net),
        credit: 0,
        memo,
      });

      inventoryLinesForPurchase.push({
        item_id: line.item_id,
        item_name: item.name,
        quantity: line.quantity,
        unit_price: line.unit_price,
        rate: line.unit_price,
        tax_rate: pct,
        tax_amount: lineTax,
        total: lineGross,
        revenue_amount: round2(cmp.net),
      });
    } else if (line.classification === "expense") {
      if (!line.expense_account_id) {
        throw new Error(`Expense line "${line.description}" needs an expense category.`);
      }
      const exp = accountById.get(line.expense_account_id);
      if (!exp) throw new Error("Expense account not found.");
      journalLines.push({
        account_id: exp.id,
        debit: round2(cmp.net),
        credit: 0,
        memo,
      });
    } else {
      if (!line.asset) {
        throw new Error(`Asset line "${line.description}" needs asset details (name, category, account, life).`);
      }
      const assetAcc = accountById.get(line.asset.asset_account_id);
      if (!assetAcc) throw new Error("Fixed asset account not found.");
      journalLines.push({
        account_id: assetAcc.id,
        debit: round2(cmp.net),
        credit: 0,
        memo,
      });
      assetLines.push({ line_net: round2(cmp.net), asset: line.asset });
    }
  }

  for (const [accountId, amt] of vatDebitByAccount) {
    if (amt <= 0) continue;
    journalLines.push({
      account_id: accountId,
      debit: round2(amt),
      credit: 0,
      memo,
    });
  }

  journalLines.push({
    account_id: ap.id,
    debit: 0,
    credit: round2(totalGross),
    memo,
  });

  ensureBalanced(journalLines);

  return {
    description,
    lines: journalLines,
    documentTotal: round2(totalGross),
    inventoryLinesForPurchase,
    assetLines,
  };
}

export type MultiLineInvoicePostingResult = {
  description: string;
  lines: JournalLine[];
  documentTotal: number;
  /** Product lines only — drives COGS / inventory reduction */
  inventoryLinesForSale: Array<DraftInventoryLine & { item_name: string }>;
};

export async function buildMultiLineInvoicePostingContext(params: {
  lines: InvoiceDocumentLine[];
  accounts: Account[];
  taxTreatment: TaxTreatment;
  counterparty: string;
  postingDate: string;
  taxRates: TaxRate[];
}): Promise<MultiLineInvoicePostingResult> {
  const { lines, accounts, taxTreatment, counterparty, postingDate, taxRates } = params;

  const ar = accounts.find((a) => a.code === "1100");
  if (!ar) throw new Error("Accounts receivable (code 1100) is missing.");

  const defaultRev = accounts.find((a) => a.code === "4000");
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const memo = memoBase(counterparty, postingDate);
  const description = lines.map((l) => l.description).join("; ") || `Invoice to ${counterparty}`;

  const journalLines: JournalLine[] = [];
  const inventoryLinesForSale: Array<DraftInventoryLine & { item_name: string }> = [];

  const vatCreditByAccount = new Map<string, number>();
  let totalGross = 0;

  for (const line of lines) {
    const item = await getBusinessItemById(line.item_id);
    if (!item) throw new Error(`Item not found for line "${line.description}".`);

    const pct = taxPctMap(taxRates, line.tax_rate_id ?? null);
    const cmp = computeVatFromRate(line.line_net, pct, taxTreatment);
    const lineTax = cmp.tax;
    const lineGross = cmp.gross;
    totalGross = round2(totalGross + lineGross);

    if (line.tax_rate_id && lineTax > 0) {
      const tr = taxRates.find((r) => r.id === line.tax_rate_id);
      const vatAccId = tr?.output_vat_account_id;
      const vatAcc = vatAccId ? accountById.get(vatAccId) : null;
      if (!vatAcc) {
        throw new Error(
          `Sales tax rate is missing an output VAT account mapping. Line: ${line.description.slice(0, 80)}`,
        );
      }
      vatCreditByAccount.set(vatAcc.id, round2((vatCreditByAccount.get(vatAcc.id) ?? 0) + lineTax));
    }

    const revenueAccountId = item.revenue_account_id ?? defaultRev?.id;
    if (!revenueAccountId) {
      throw new Error(`Set a revenue account on "${item.name}" or add default account code 4000.`);
    }
    const revAcc = accountById.get(revenueAccountId);
    if (!revAcc) throw new Error("Revenue account not found.");

    journalLines.push({
      account_id: revAcc.id,
      debit: 0,
      credit: round2(cmp.net),
      memo,
    });

    const isProduct = line.line_type === "product" && item.item_type === "product" && item.inventory_tracked;
    if (isProduct) {
      if (!line.quantity || line.unit_price == null) {
        throw new Error(`Quantity and unit price are required for product line "${line.description}".`);
      }
      inventoryLinesForSale.push({
        item_id: line.item_id,
        item_name: item.name,
        quantity: line.quantity,
        unit_price: line.unit_price,
        rate: line.unit_price,
        tax_rate: pct,
        tax_amount: lineTax,
        total: lineGross,
        revenue_amount: round2(cmp.net),
      });
    } else if (line.line_type === "product") {
      throw new Error(
        `Line "${line.description}" is marked as a product but the item is not inventory-tracked. Change line type to service or use an inventory product.`,
      );
    }
  }

  for (const [accountId, amt] of vatCreditByAccount) {
    if (amt <= 0) continue;
    journalLines.push({
      account_id: accountId,
      debit: 0,
      credit: round2(amt),
      memo,
    });
  }

  journalLines.push({
    account_id: ar.id,
    debit: round2(totalGross),
    credit: 0,
    memo,
  });

  ensureBalanced(journalLines);

  return {
    description,
    lines: journalLines,
    documentTotal: round2(totalGross),
    inventoryLinesForSale,
  };
}

export function parseBillDocumentLines(raw: unknown): BillDocumentLine[] {
  const arr = z.array(BillDocumentLineSchema).safeParse(raw);
  if (!arr.success) {
    throw new Error("Invalid multi-line bill data. Check each line has amounts and accounts.");
  }
  return arr.data;
}

export function parseInvoiceDocumentLines(raw: unknown): InvoiceDocumentLine[] {
  const arr = z.array(InvoiceDocumentLineSchema).safeParse(raw);
  if (!arr.success) {
    const issue = arr.error.issues[0];
    const idx = issue?.path?.[0];
    const lineHint =
      typeof idx === "number" ? ` (row ${idx + 1})` : "";
    throw new Error(
      `Invalid multi-line invoice data${lineHint}: ${issue?.message ?? arr.error.message}`,
    );
  }
  return arr.data;
}
