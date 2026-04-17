"use server";

import { z } from "zod";
import { saveDraftAction } from "@/lib/actions/drafts";
import { findOrCreateContactAction } from "@/lib/actions/contacts";
import { listAccounts } from "@/lib/data/accounts";
import { listContacts } from "@/lib/data/contacts";
import { listTaxRates, getTaxRateById } from "@/lib/data/tax-rates";
import { getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { getErrorMessage } from "@/lib/utils";
import { formatZodErrorForUser } from "@/lib/utils/zod-user-message";
import { getCurrentUser } from "@/lib/data/users";
import type { Account } from "@/lib/accounting";
import { filterBankReconciliationAccounts } from "@/lib/accounting/is-bank-account";
import type { DraftPayload } from "@/lib/ai/schema";
import {
  getBusinessItemById,
  getInventoryBalance,
  getInventoryItem,
  type BusinessItem,
} from "@/lib/data/inventory";
import { round2 } from "@/lib/posting/posting-engine";
import { buildTransactionAmounts, validateTransactionAmountsMatch } from "@/lib/posting/transaction-amounts";
import { buildBillAccounts, suggestionForAccount } from "@/lib/posting/bill-accounts";
import { dedupeEntitiesForDisplay } from "@/lib/utils/entity-dedupe";
import { resolveInventorySaleCostsForDraft } from "@/lib/inventory/guided-invoice-inventory-validation";
import { parseBillDocumentLines, parseInvoiceDocumentLines } from "@/lib/posting/multi-line-documents";
import type { BillDocumentLine, InvoiceDocumentLine } from "@/lib/posting/multi-line-documents";
import { assertInvoiceLinesValidForDraft } from "@/lib/drafts/multi-line-invoice-validation";
import { listTaxRatesAction, type TaxRate } from "@/lib/actions/tax-rates";
import { listAccountsForItemWizardAction } from "@/lib/actions/items-picker";

function generateDraftOpReferenceId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Client sends `tax_rate_id: null` for explicit no tax. Do not substitute item/document default in that case.
 */
function resolveLineTaxRateIdFromPayload(
  rowTax: string | null | undefined,
  documentDefault: string | null | undefined,
  itemDefault: string | null | undefined,
): string | null {
  if (rowTax === null) return null;
  if (typeof rowTax === "string" && rowTax.length > 0) return rowTax;
  return documentDefault ?? itemDefault ?? null;
}

type AccountSuggestion = NonNullable<DraftPayload["accounts"]>["debit_account"];

async function buildInvoiceAccounts(
  accounts: Account[],
  revenueAccountId: string | null,
  taxRateId: string | null,
): Promise<NonNullable<DraftPayload["accounts"]>> {
  const ar = accounts.find((a) => a.code === "1100");
  const revenue = revenueAccountId
    ? accounts.find((a) => a.id === revenueAccountId)
    : accounts.find((a) => a.code === "4000");
  if (!ar) {
    throw new Error("Accounts receivable (code 1100) is missing.");
  }
  if (!revenue) {
    throw new Error("Revenue account is missing. Set it on the item or add code 4000.");
  }
  let taxCredit: AccountSuggestion | undefined;
  if (taxRateId) {
    const tr = await getTaxRateById(taxRateId);
    if (tr?.output_vat_account_id) {
      const acc = accounts.find((a) => a.id === tr.output_vat_account_id);
      if (acc) taxCredit = suggestionForAccount(acc);
    }
  }
  return {
    debit_account: suggestionForAccount(ar),
    credit_account: suggestionForAccount(revenue),
    tax_debit_account: undefined,
    tax_credit_account: taxCredit,
  };
}

async function resolveContactId(
  name: string,
  kind: "customer" | "vendor",
): Promise<string> {
  const row = await findOrCreateContactAction(
    name.trim(),
    kind === "customer" ? "customer" : "vendor",
  );
  return row.id;
}

const InvoiceGuidedSchema = z.object({
  customerName: z.string().min(1, "Customer is required"),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  itemId: z.string().uuid("Select a product or service"),
  lineNote: z.string().optional(),
  /** Inventory-tracked product sale */
  quantity: z.number().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  /** Service or non-tracked product — single amount */
  amount: z.number().positive().optional(),
  taxRateId: z.string().uuid().optional().nullable(),
  taxTreatment: z.enum(["exclusive", "inclusive"]),
  transactionAmounts: z
    .object({
      entered_amount: z.number(),
      tax_rate: z.number(),
      tax_treatment: z.enum(["exclusive", "inclusive"]),
      subtotal_amount: z.number(),
      tax_amount: z.number(),
      total_amount: z.number(),
    })
    .optional(),
});

const BillGuidedSchema = z.object({
  supplierName: z.string().min(1, "Supplier is required"),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purchaseType: z.enum(["inventory", "expense", "asset"]),
  itemId: z.string().uuid().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  expenseAccountId: z.string().uuid().optional(),
  description: z.string().min(1),
  asset: z
    .object({
      name: z.string().min(1),
      category: z.string().min(1),
      assetAccountId: z.string().uuid(),
      usefulLifeYears: z.number().int().positive(),
      depreciationMethod: z.enum(["straight_line"]),
    })
    .optional(),
  enteredAmount: z.number().positive(),
  taxRateId: z.string().uuid().optional().nullable(),
  taxTreatment: z.enum(["exclusive", "inclusive"]),
  transactionAmounts: z
    .object({
      entered_amount: z.number(),
      tax_rate: z.number(),
      tax_treatment: z.enum(["exclusive", "inclusive"]),
      subtotal_amount: z.number(),
      tax_amount: z.number(),
      total_amount: z.number(),
    })
    .optional(),
});

const PaymentInSchema = z.object({
  customerName: z.string().min(1),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  bankAccountId: z.string().uuid(),
  referenceInvoice: z.string().optional(),
  note: z.string().optional(),
  allocations: z
    .array(z.object({ invoiceId: z.string().uuid(), amount: z.number().positive() }))
    .optional(),
});

const PaymentOutSchema = z.object({
  supplierName: z.string().min(1),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  bankAccountId: z.string().uuid(),
  referenceBill: z.string().optional(),
  note: z.string().optional(),
  allocations: z
    .array(z.object({ billId: z.string().uuid(), amount: z.number().positive() }))
    .optional(),
});

export async function listContactsForPickerAction(): Promise<
  { id: string; name: string; type: string }[]
> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];
  const contacts = await listContacts();
  const mapped = contacts.map((c) => ({ id: c.id, name: c.name, type: c.type }));
  return dedupeEntitiesForDisplay(mapped as Record<string, unknown>[], {
    idKey: "id",
    nameKey: "name",
    scopeKey: "type",
    entityLabel: "contacts-picker",
  }) as { id: string; name: string; type: string }[];
}

export async function listBankAccountsForPickerAction(): Promise<
  { id: string; name: string; code: string }[]
> {
  const accounts = await listAccounts();
  const banks = filterBankReconciliationAccounts(accounts as Account[]);
  const mapped = banks.map((a) => ({ id: a.id, name: a.name, code: a.code }));
  return dedupeEntitiesForDisplay(mapped as Record<string, unknown>[], {
    idKey: "id",
    entityLabel: "bank-accounts-picker",
  }) as { id: string; name: string; code: string }[];
}

/**
 * One server-action round-trip for Record activity / guided workspace initial load.
 * Avoids four separate client POSTs (contacts, banks, tax rates, chart for bill lines).
 */
export async function loadGuidedEventWorkspacePreflightAction(): Promise<{
  contacts: Awaited<ReturnType<typeof listContactsForPickerAction>>;
  banks: Awaited<ReturnType<typeof listBankAccountsForPickerAction>>;
  taxRates: TaxRate[];
  accounts: Awaited<ReturnType<typeof listAccountsForItemWizardAction>>;
}> {
  const [contacts, banks, taxRates] = await Promise.all([
    listContactsForPickerAction(),
    listBankAccountsForPickerAction(),
    listTaxRatesAction(),
  ]);
  let accounts: Awaited<ReturnType<typeof listAccountsForItemWizardAction>> = [];
  try {
    accounts = await listAccountsForItemWizardAction();
  } catch {
    // Matches prior client behaviour — accounts optional until bill line needs expense/asset picker.
  }
  return { contacts, banks, taxRates, accounts };
}

export async function createContactFromPickerAction(
  name: string,
  kind: "customer" | "vendor",
) {
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Not signed in.");
  const row = await findOrCreateContactAction(
    name.trim(),
    kind === "customer" ? "customer" : "vendor",
  );
  return { id: row.id, name: row.name, type: row.type };
}

/** Unit cost for margin preview (balance average; actual COGS at post uses FIFO / weighted average). */
export async function getSaleCostPreviewAction(itemId: string): Promise<{
  unitCost: number | null;
  valuationMethod: string | null;
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return { unitCost: null, valuationMethod: null };
  }
  const item = await getBusinessItemById(itemId);
  if (!item || item.item_type !== "product" || !item.inventory_tracked) {
    return { unitCost: null, valuationMethod: null };
  }
  const inv = await getInventoryItem(itemId);
  const balance = await getInventoryBalance(itemId);
  const q = balance?.quantity ?? 0;
  const tv = balance?.total_value ?? 0;
  const fromAvg = balance?.average_cost != null ? Number(balance.average_cost) : null;
  const fromQv = q > 0 ? tv / q : null;
  const unitCost = fromAvg ?? fromQv ?? item.cost_price ?? 0;
  return {
    unitCost: round2(Number(unitCost)),
    valuationMethod: inv?.valuation_method ?? "fifo",
  };
}

export async function createGuidedInvoiceAction(
  input: z.infer<typeof InvoiceGuidedSchema>,
) {
  const parsed = InvoiceGuidedSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");

  const item = await getBusinessItemById(parsed.itemId);
  if (!item) throw new Error("Item not found.");

  const isInventorySale = item.item_type === "product" && item.inventory_tracked;

  if (isInventorySale) {
    if (parsed.quantity == null || parsed.unitPrice == null) {
      throw new Error("Quantity and Unit Price are required for inventory items.");
    }
    if (parsed.quantity <= 0 || parsed.unitPrice < 0) {
      throw new Error("Quantity and Unit Price are required for inventory items.");
    }
  } else if (parsed.amount == null) {
    throw new Error("Amount is required.");
  }

  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);
  const contactId = await resolveContactId(parsed.customerName, "customer");
  const accounts = await listAccounts();

  let effectiveTaxId = parsed.taxRateId ?? item.default_tax_rate_id ?? null;
  if (effectiveTaxId) {
    const rates = await listTaxRates();
    const ok = rates.some((r) => r.id === effectiveTaxId && r.tax_type === "output");
    if (!ok) effectiveTaxId = null;
  }

  let tax: { rate: number; amount: null } | null = null;
  let taxRateLink: { tax_rate_id: string } | undefined;
  let taxPct = 0;
  if (effectiveTaxId) {
    const rates = await listTaxRates();
    const tr = rates.find((r) => r.id === effectiveTaxId && r.tax_type === "output");
    if (!tr) throw new Error("Select a valid sales tax rate.");
    tax = { rate: tr.percentage, amount: null };
    taxRateLink = { tax_rate_id: tr.id };
    taxPct = tr.percentage;
  }

  const enteredForAmounts = isInventorySale
    ? parsed.quantity! * parsed.unitPrice!
    : parsed.amount!;

  const expectedAmounts = buildTransactionAmounts({
    entered_amount: enteredForAmounts,
    tax_rate: taxPct,
    tax_treatment: parsed.taxTreatment,
  });

  if (parsed.transactionAmounts) {
    const match = validateTransactionAmountsMatch(expectedAmounts, parsed.transactionAmounts);
    if (!match.ok && process.env.NODE_ENV !== "production") {
      console.warn("[createGuidedInvoiceAction] transaction_amounts mismatch; using server-computed values", {
        expected: expectedAmounts,
        client: parsed.transactionAmounts,
        enteredForAmounts,
      });
    }
  }

  const description = [item.name, parsed.lineNote?.trim()].filter(Boolean).join(" — ");

  const accountPayload = await buildInvoiceAccounts(
    accounts as Account[],
    item.revenue_account_id,
    effectiveTaxId,
  );

  const entitiesAmount =
    parsed.taxTreatment === "inclusive"
      ? expectedAmounts.total_amount
      : expectedAmounts.subtotal_amount;

  let costPrice: number | null = null;
  let cogsAmount: number | null = null;
  let margin: number | null = null;

  if (isInventorySale) {
    try {
      const defaultRevId = accounts.find((a) => a.code === "4000")?.id ?? null;
      const resolved = await resolveInventorySaleCostsForDraft({
        tenantId: user.tenant.id,
        item,
        quantity: parsed.quantity!,
        invoiceDate: parsed.invoiceDate,
        revenueSubtotal: expectedAmounts.subtotal_amount,
        defaultRevenueAccountId: defaultRevId,
      });
      costPrice = resolved.unitCost;
      cogsAmount = resolved.cogsAmount;
      margin = resolved.margin;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Inventory validation failed.";
      console.error("[createGuidedInvoiceAction] inventory sale validation", {
        tenant_id: user.tenant.id,
        product_id: item.id,
        customer_id: contactId,
        quantity: parsed.quantity,
        error: e,
        stack: e instanceof Error ? e.stack : undefined,
      });
      throw new Error(msg);
    }
  }

  const guidedInvoiceLine = {
    item_id: item.id,
    type: isInventorySale ? ("product" as const) : ("service" as const),
    quantity: isInventorySale ? parsed.quantity! : null,
    unit_price: isInventorySale ? parsed.unitPrice! : null,
    total: expectedAmounts.total_amount,
    cost_price: costPrice,
    cogs: cogsAmount,
    margin,
    revenue_amount: expectedAmounts.subtotal_amount,
  };

  const inventoryLineItems = isInventorySale
    ? [
        {
          item_id: item.id,
          item_name: item.name,
          type: "product" as const,
          quantity: parsed.quantity!,
          unit_price: parsed.unitPrice!,
          rate: parsed.unitPrice!,
          discount: 0,
          tax_rate: taxPct,
          tax_amount: expectedAmounts.tax_amount,
          total: expectedAmounts.total_amount,
          cost_price: costPrice,
          revenue_amount: expectedAmounts.subtotal_amount,
          cogs_amount: cogsAmount,
          margin,
        },
      ]
    : undefined;

  try {
    return await saveDraftAction({
      intent: "create_invoice",
      confidence: 1,
      contactId,
      entities: {
        amount: entitiesAmount,
        currency: baseCurrency,
        date: parsed.invoiceDate,
        counterparty: parsed.customerName,
        description,
        due_date: parsed.dueDate,
        tax,
        invoice_number: null,
      },
      taxRateLink,
      tax_treatment: parsed.taxTreatment,
      accounts: accountPayload,
      selectedItemId: item.id,
      itemSnapshot: {
        item_type: item.item_type,
        inventory_tracked: item.inventory_tracked,
        name: item.name,
      },
      guidedEventRequiresItem: true,
      inventoryLineItems,
      transactionAmounts: expectedAmounts,
      guidedInvoiceLine,
    });
  } catch (e) {
    const msg = getErrorMessage(e, "Could not create draft.");
    console.error("[createGuidedInvoiceAction] saveDraft failed", {
      tenant_id: user.tenant.id,
      product_id: item.id,
      customer_id: contactId,
      quantity: isInventorySale ? parsed.quantity : undefined,
      inventory_tracked: isInventorySale,
      error: e,
      stack: e instanceof Error ? e.stack : undefined,
    });
    throw new Error(
      msg.includes("draft") || msg.includes("invoice") || msg.includes("number")
        ? msg
        : `Cannot generate invoice draft: ${msg}`,
    );
  }
}

export async function createGuidedBillAction(input: z.infer<typeof BillGuidedSchema>) {
  const parsed = BillGuidedSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");

  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);
  const contactId = await resolveContactId(parsed.supplierName, "vendor");
  const accounts = await listAccounts();

  // Resolve tax (input)
  let effectiveTaxId = parsed.taxRateId ?? null;
  let tax: { rate: number; amount: null } | null = null;
  let taxRateLink: { tax_rate_id: string } | undefined;
  let taxPct = 0;
  if (effectiveTaxId) {
    const rates = await listTaxRates();
    const tr = rates.find((r) => r.id === effectiveTaxId && r.tax_type === "input");
    if (!tr) throw new Error("Select a valid purchase tax rate.");
    tax = { rate: tr.percentage, amount: null };
    taxRateLink = { tax_rate_id: tr.id };
    taxPct = tr.percentage;
  }

  const canonicalEntered =
    parsed.purchaseType === "inventory"
      ? (parsed.quantity ?? 0) * (parsed.unitPrice ?? 0)
      : parsed.enteredAmount;

  if (parsed.purchaseType === "inventory") {
    if (
      parsed.quantity == null ||
      parsed.unitPrice == null ||
      parsed.quantity <= 0 ||
      parsed.unitPrice < 0 ||
      canonicalEntered <= 0
    ) {
      throw new Error("Quantity and unit price are required for inventory purchases.");
    }
  }

  const expectedAmounts = buildTransactionAmounts({
    entered_amount: canonicalEntered,
    tax_rate: taxPct,
    tax_treatment: parsed.taxTreatment,
  });

  if (parsed.transactionAmounts) {
    const match = validateTransactionAmountsMatch(expectedAmounts, parsed.transactionAmounts);
    if (!match.ok && process.env.NODE_ENV !== "production") {
      console.warn("[createGuidedBillAction] transaction_amounts mismatch; using server-computed values", {
        expected: expectedAmounts,
        client: parsed.transactionAmounts,
        canonicalEntered,
      });
    }
  }

  let selectedItemId: string | null = null;
  let itemSnapshot:
    | { item_type: "product" | "service"; inventory_tracked: boolean; name: string }
    | null = null;
  let inventoryLineItems:
    | Array<{
        item_id: string;
        item_name: string;
        type?: "product";
        quantity: number;
        unit_price: number;
        rate: number;
        discount: number;
        tax_rate: number;
        tax_amount: number;
        total: number;
      }>
    | undefined;

  let accountPayload: NonNullable<DraftPayload["accounts"]>;

  if (parsed.purchaseType === "inventory") {
    if (!parsed.itemId) throw new Error("Select a product.");
    const item = await getBusinessItemById(parsed.itemId);
    if (!item) throw new Error("Item not found.");
    if (item.item_type !== "product" || item.inventory_tracked !== true) {
      throw new Error("Select an inventory-tracked product for Inventory purchases.");
    }
    const invAccId = item.inventory_account_id ?? null;
    if (!invAccId) throw new Error("Selected item is missing an inventory account mapping.");
    // Debit inventory, credit AP (+ VAT input if any)
    accountPayload = await buildBillAccounts(accounts as Account[], invAccId, effectiveTaxId);
    selectedItemId = item.id;
    itemSnapshot = { item_type: item.item_type, inventory_tracked: item.inventory_tracked, name: item.name };
    const q = parsed.quantity ?? 1;
    const unit = parsed.unitPrice ?? expectedAmounts.subtotal_amount / (q > 0 ? q : 1);
    inventoryLineItems = [
      {
        item_id: item.id,
        item_name: item.name,
        type: "product",
        quantity: q,
        unit_price: unit,
        rate: unit,
        discount: 0,
        tax_rate: taxPct,
        tax_amount: expectedAmounts.tax_amount,
        total: expectedAmounts.total_amount,
      },
    ];
  } else if (parsed.purchaseType === "expense") {
    if (!parsed.expenseAccountId) throw new Error("Choose an expense category.");
    accountPayload = await buildBillAccounts(accounts as Account[], parsed.expenseAccountId, effectiveTaxId);
  } else {
    // asset
    if (!parsed.asset) throw new Error("Asset details are required.");
    accountPayload = await buildBillAccounts(accounts as Account[], parsed.asset.assetAccountId, effectiveTaxId);
  }

  return saveDraftAction({
    intent: "create_bill",
    confidence: 1,
    contactId,
    entities: {
      amount:
        parsed.taxTreatment === "inclusive"
          ? expectedAmounts.total_amount
          : expectedAmounts.subtotal_amount,
      currency: baseCurrency,
      date: parsed.billDate,
      counterparty: parsed.supplierName,
      description: parsed.description,
      due_date: parsed.dueDate,
      tax,
    },
    taxRateLink,
    tax_treatment: parsed.taxTreatment,
    accounts: accountPayload,
    selectedItemId,
    itemSnapshot: itemSnapshot ?? undefined,
    guidedEventRequiresItem: parsed.purchaseType === "inventory",
    inventoryLineItems,
    billPurchaseType: parsed.purchaseType,
    transactionAmounts: expectedAmounts,
    fixedAssetDraft:
      parsed.purchaseType === "asset" && parsed.asset
        ? {
            name: parsed.asset.name,
            category: parsed.asset.category,
            asset_account_id: parsed.asset.assetAccountId,
            useful_life_years: parsed.asset.usefulLifeYears,
            depreciation_method: parsed.asset.depreciationMethod,
          }
        : undefined,
  });
}

const MultiBillLineInSchema = z.object({
  classification: z.enum(["inventory", "expense", "asset"]),
  description: z.string().min(1),
  line_net: z.number().nonnegative(),
  tax_rate_id: z.string().uuid().nullable().optional(),
  item_id: z.string().uuid().optional(),
  quantity: z.number().positive().optional(),
  unit_price: z.number().nonnegative().optional(),
  expense_account_id: z.string().uuid().optional(),
  asset: z
    .object({
      name: z.string().min(1),
      category: z.string().min(1),
      asset_account_id: z.string().uuid(),
      useful_life_years: z.number().int().positive(),
      depreciation_method: z.enum(["straight_line", "reducing_balance", "units_of_production", "none"]),
      residual_value: z.number().nonnegative().optional(),
      start_depreciation_date: z.string().optional(),
      serial_number: z.string().optional(),
      location: z.string().optional(),
      assigned_to: z.string().optional(),
      quantity: z.number().int().positive().optional(),
      depreciation_method_raw: z.string().optional(),
      asset_drafts: z
        .array(
          z.object({
            index: z.number().int().nonnegative(),
            name: z.string().default(""),
            serialNumber: z.string().default(""),
            location: z.string().default(""),
            costOverride: z.string().default(""),
          }),
        )
        .optional(),
    })
    .optional(),
});

const MultiLineBillGuidedSchema = z.object({
  supplierName: z.string().min(1),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxTreatment: z.enum(["exclusive", "inclusive"]),
  defaultTaxRateId: z.string().uuid().optional().nullable(),
  lines: z.array(MultiBillLineInSchema).min(1),
});

/**
 * Mixed inventory / expense / asset lines on one supplier bill (single AP total).
 */
export async function createGuidedMultiLineBillAction(
  input: z.input<typeof MultiLineBillGuidedSchema>,
) {
  const refId = generateDraftOpReferenceId();
  const isProd = process.env.NODE_ENV === "production";
  let tenantId: string | undefined;
  let contactId: string | null = null;

  try {
    const validated = MultiLineBillGuidedSchema.safeParse(input);
    if (!validated.success) {
      throw new Error(formatZodErrorForUser(validated.error, "Supplier bill"));
    }
    const parsed = validated.data;

    const user = await getCurrentUser();
    if (!user?.tenant) throw new Error("Tenant not resolved.");
    tenantId = user.tenant.id;

    const baseCurrency = await getTenantBaseCurrency(user.tenant.id);
    contactId = await resolveContactId(parsed.supplierName, "vendor");
    const accounts = await listAccounts();
    const rates = await listTaxRates();

    const documentLines: BillDocumentLine[] = [];

    for (const row of parsed.lines) {
      if (row.classification === "inventory") {
        if (!row.item_id || !row.quantity || row.unit_price == null) {
          throw new Error(`Inventory line "${row.description}" needs a product, quantity, and unit price.`);
        }
        const expected = round2(row.quantity * row.unit_price);
        if (Math.abs(expected - row.line_net) > 0.02) {
          throw new Error(`Line "${row.description}" amount does not match quantity × unit price.`);
        }
        const item = await getBusinessItemById(row.item_id);
        if (!item || item.item_type !== "product" || !item.inventory_tracked) {
          throw new Error(`Select an inventory-tracked product for "${row.description}".`);
        }
        const taxId = resolveLineTaxRateIdFromPayload(
          row.tax_rate_id,
          parsed.defaultTaxRateId,
          item.default_tax_rate_id,
        );
        documentLines.push({
          classification: "inventory",
          description: row.description,
          line_net: row.line_net,
          tax_rate_id: taxId,
          item_id: row.item_id,
          quantity: row.quantity,
          unit_price: row.unit_price,
        });
      } else if (row.classification === "expense") {
        if (!row.expense_account_id) {
          throw new Error(`Expense line "${row.description}" needs an expense category.`);
        }
        const taxId = resolveLineTaxRateIdFromPayload(row.tax_rate_id, parsed.defaultTaxRateId, null);
        documentLines.push({
          classification: "expense",
          description: row.description,
          line_net: row.line_net,
          tax_rate_id: taxId,
          expense_account_id: row.expense_account_id,
          ...(row.item_id ? { item_id: row.item_id } : {}),
        });
      } else {
        if (!row.asset) {
          throw new Error(`Asset line "${row.description}" needs asset name, category, and account.`);
        }
        const taxId = resolveLineTaxRateIdFromPayload(row.tax_rate_id, parsed.defaultTaxRateId, null);
        documentLines.push({
          classification: "asset",
          description: row.description,
          line_net: row.line_net,
          tax_rate_id: taxId,
          asset: row.asset,
        });
      }
    }

    parseBillDocumentLines(documentLines);

    let sumSub = 0;
    let sumTax = 0;
    let sumTot = 0;
    for (const line of documentLines) {
      const tid = line.tax_rate_id;
      const pct = tid ? rates.find((r) => r.id === tid && r.tax_type === "input")?.percentage ?? 0 : 0;
      const tx = buildTransactionAmounts({
        entered_amount: line.line_net,
        tax_rate: pct,
        tax_treatment: parsed.taxTreatment,
      });
      sumSub += tx.subtotal_amount;
      sumTax += tx.tax_amount;
      sumTot += tx.total_amount;
    }

    const transactionAmounts = {
      entered_amount: parsed.taxTreatment === "inclusive" ? sumTot : sumSub,
      tax_rate: sumSub > 0 ? round2((sumTax / sumSub) * 100) : 0,
      tax_treatment: parsed.taxTreatment,
      subtotal_amount: round2(sumSub),
      tax_amount: round2(sumTax),
      total_amount: round2(sumTot),
    };

    const primaryTaxId =
      documentLines.find((l) => l.tax_rate_id)?.tax_rate_id ?? parsed.defaultTaxRateId ?? null;
    let tax: { rate: number; amount: null } | null = null;
    let taxRateLink: { tax_rate_id: string } | undefined;
    if (primaryTaxId) {
      const tr = rates.find((r) => r.id === primaryTaxId && r.tax_type === "input");
      if (tr) {
        tax = { rate: tr.percentage, amount: null };
        taxRateLink = { tax_rate_id: tr.id };
      }
    }

    const exp = accounts.find((a) => a.code === "5000");
    const accountPayload = await buildBillAccounts(accounts as Account[], exp?.id ?? null, primaryTaxId ?? null);

    const descSummary = documentLines.map((l) => l.description).join("; ");

    console.info("[createGuidedMultiLineBillAction] generating draft", {
      refId,
      tenant_id: user.tenant.id,
      contact_id: contactId,
      bill_date: parsed.billDate,
      line_count: parsed.lines.length,
    });

    return await saveDraftAction({
      intent: "create_bill",
      confidence: 1,
      contactId,
      entities: {
        amount: parsed.taxTreatment === "inclusive" ? transactionAmounts.total_amount : transactionAmounts.subtotal_amount,
        currency: baseCurrency,
        date: parsed.billDate,
        counterparty: parsed.supplierName,
        description: descSummary,
        due_date: parsed.dueDate,
        tax,
      },
      taxRateLink,
      tax_treatment: parsed.taxTreatment,
      accounts: accountPayload,
      transactionAmounts,
      documentLineItems: documentLines as unknown as Array<Record<string, unknown>>,
    });
  } catch (err) {
    const stack = err instanceof Error ? err.stack : undefined;
    const fallbackLines =
      input && typeof input === "object" && "lines" in input && Array.isArray((input as { lines: unknown }).lines)
        ? (input as { lines: Array<Record<string, unknown>> }).lines
        : [];
    console.error("[createGuidedMultiLineBillAction] failed", {
      refId,
      tenant_id: tenantId,
      contact_id: contactId,
      line_count: fallbackLines.length,
      lines: fallbackLines,
      error: err,
      stack,
    });
    if (isProd) {
      throw new Error(`Could not create supplier bill draft. Reference: ${refId}`);
    }
    throw new Error(getErrorMessage(err, "Could not create supplier bill draft."));
  }
}

const MultiInvoiceLineInSchema = z.object({
  line_type: z.enum(["product", "service"]),
  description: z.string().min(1),
  item_id: z.string().uuid(),
  line_net: z.number().nonnegative(),
  quantity: z.number().positive().optional(),
  unit_price: z.number().nonnegative().optional(),
  tax_rate_id: z.string().uuid().nullable().optional(),
});

const MultiLineInvoiceGuidedSchema = z.object({
  customerName: z.string().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxTreatment: z.enum(["exclusive", "inclusive"]),
  defaultTaxRateId: z.string().uuid().optional().nullable(),
  lines: z.array(MultiInvoiceLineInSchema).min(1),
});

/**
 * Mixed product (inventory) and service lines on one sales invoice (single AR total).
 */
export async function createGuidedMultiLineInvoiceAction(
  input: z.input<typeof MultiLineInvoiceGuidedSchema>,
) {
  const refId = generateDraftOpReferenceId();
  const isProd = process.env.NODE_ENV === "production";
  let tenantId: string | undefined;
  let contactId: string | null = null;

  try {
    const validated = MultiLineInvoiceGuidedSchema.safeParse(input);
    if (!validated.success) {
      throw new Error(formatZodErrorForUser(validated.error, "Sales invoice"));
    }
    const parsed = validated.data;

    const user = await getCurrentUser();
    if (!user?.tenant) throw new Error("Tenant not resolved.");
    tenantId = user.tenant.id;

    const baseCurrency = await getTenantBaseCurrency(user.tenant.id);
    contactId = await resolveContactId(parsed.customerName, "customer");
    const accounts = await listAccounts();
    const rates = await listTaxRates();
    const defaultRevenueAccountExists = accounts.some((a) => a.code === "4000");
    const defaultRevId = accounts.find((a) => a.code === "4000")?.id ?? null;

    const itemsById = new Map<string, BusinessItem>();
    for (const row of parsed.lines) {
      const item = await getBusinessItemById(row.item_id);
      if (item) itemsById.set(row.item_id, item);
    }

    assertInvoiceLinesValidForDraft({
      lines: parsed.lines,
      itemsById,
      defaultRevenueAccountExists,
    });

    const documentLines: InvoiceDocumentLine[] = [];

    for (let i = 0; i < parsed.lines.length; i++) {
      const row = parsed.lines[i];
      const item = itemsById.get(row.item_id)!;

      const taxId = resolveLineTaxRateIdFromPayload(
        row.tax_rate_id,
        parsed.defaultTaxRateId,
        item.default_tax_rate_id,
      );
      if (row.line_type === "product") {
        try {
          await resolveInventorySaleCostsForDraft({
            tenantId: user.tenant.id,
            item,
            quantity: row.quantity!,
            invoiceDate: parsed.invoiceDate,
            revenueSubtotal: row.line_net,
            defaultRevenueAccountId: defaultRevId,
          });
        } catch (invErr) {
          const base = getErrorMessage(invErr, "Inventory validation failed.");
          const cleaned = base.replace(/^Cannot generate invoice draft:\s*/i, "");
          throw new Error(`Line ${i + 1}: ${cleaned}`);
        }
      }

      documentLines.push({
        line_type: row.line_type,
        description: row.description,
        line_net: row.line_net,
        tax_rate_id: taxId,
        item_id: row.item_id,
        quantity: row.quantity,
        unit_price: row.unit_price,
      });
    }

    parseInvoiceDocumentLines(documentLines);

    let sumSub = 0;
    let sumTax = 0;
    let sumTot = 0;
    for (const line of documentLines) {
      const tid = line.tax_rate_id;
      const pct = tid ? rates.find((r) => r.id === tid && r.tax_type === "output")?.percentage ?? 0 : 0;
      const tx = buildTransactionAmounts({
        entered_amount: line.line_net,
        tax_rate: pct,
        tax_treatment: parsed.taxTreatment,
      });
      sumSub += tx.subtotal_amount;
      sumTax += tx.tax_amount;
      sumTot += tx.total_amount;
    }

    const transactionAmounts = {
      entered_amount: parsed.taxTreatment === "inclusive" ? sumTot : sumSub,
      tax_rate: sumSub > 0 ? round2((sumTax / sumSub) * 100) : 0,
      tax_treatment: parsed.taxTreatment,
      subtotal_amount: round2(sumSub),
      tax_amount: round2(sumTax),
      total_amount: round2(sumTot),
    };

    const primaryTaxId =
      documentLines.find((l) => l.tax_rate_id)?.tax_rate_id ?? parsed.defaultTaxRateId ?? null;
    let tax: { rate: number; amount: null } | null = null;
    let taxRateLink: { tax_rate_id: string } | undefined;
    if (primaryTaxId) {
      const tr = rates.find((r) => r.id === primaryTaxId && r.tax_type === "output");
      if (tr) {
        tax = { rate: tr.percentage, amount: null };
        taxRateLink = { tax_rate_id: tr.id };
      }
    }

    const first = await getBusinessItemById(parsed.lines[0].item_id);
    const accountPayload = await buildInvoiceAccounts(
      accounts as Account[],
      first?.revenue_account_id ?? defaultRevId,
      primaryTaxId ?? null,
    );

    const descSummary = documentLines.map((l) => l.description).join("; ");

    const lineDebug = parsed.lines.map((row, idx) => {
      const it = itemsById.get(row.item_id);
      return {
        line_index: idx + 1,
        line_type: row.line_type,
        item_id: row.item_id,
        description: row.description,
        quantity: row.quantity,
        unit_price: row.unit_price,
        line_net: row.line_net,
        tax_rate_id: resolveLineTaxRateIdFromPayload(
          row.tax_rate_id,
          parsed.defaultTaxRateId,
          it?.default_tax_rate_id ?? null,
        ),
        item_name: it?.name,
        item_type: it?.item_type,
        revenue_account_id: it?.revenue_account_id ?? null,
        inventory_account_id: it?.inventory_account_id ?? null,
        cogs_account_id: it?.cogs_account_id ?? null,
      };
    });

    console.info("[createGuidedMultiLineInvoiceAction] generating draft", {
      refId,
      tenant_id: user.tenant.id,
      contact_id: contactId,
      invoice_date: parsed.invoiceDate,
      line_count: parsed.lines.length,
      lines: lineDebug,
      transaction_amounts: transactionAmounts,
    });

    return await saveDraftAction({
      intent: "create_invoice",
      confidence: 1,
      contactId,
      entities: {
        amount: parsed.taxTreatment === "inclusive" ? transactionAmounts.total_amount : transactionAmounts.subtotal_amount,
        currency: baseCurrency,
        date: parsed.invoiceDate,
        counterparty: parsed.customerName,
        description: descSummary,
        due_date: parsed.dueDate,
        tax,
        invoice_number: null,
      },
      taxRateLink,
      tax_treatment: parsed.taxTreatment,
      accounts: accountPayload,
      selectedItemId: parsed.lines[0].item_id,
      itemSnapshot: first
        ? {
            item_type: first.item_type,
            inventory_tracked: first.inventory_tracked,
            name: first.name,
          }
        : undefined,
      guidedEventRequiresItem: true,
      transactionAmounts,
      documentLineItems: documentLines as unknown as Array<Record<string, unknown>>,
    });
  } catch (err) {
    const stack = err instanceof Error ? err.stack : undefined;
    const fallbackLines =
      input && typeof input === "object" && "lines" in input && Array.isArray((input as { lines: unknown }).lines)
        ? (input as { lines: Array<Record<string, unknown>> }).lines
        : [];
    console.error("[createGuidedMultiLineInvoiceAction] failed", {
      refId,
      tenant_id: tenantId,
      contact_id: contactId,
      line_count: fallbackLines.length,
      lines: fallbackLines,
      error: err,
      stack,
    });
    if (isProd) {
      throw new Error(`Could not create invoice draft. Reference: ${refId}`);
    }
    const msg = getErrorMessage(err, "Could not create invoice draft.");
    throw new Error(msg);
  }
}

export async function createGuidedPaymentReceivedAction(
  input: z.infer<typeof PaymentInSchema>,
) {
  const parsed = PaymentInSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");

  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);
  const accounts = await listAccounts();
  const ar = accounts.find((a) => a.code === "1100");
  const bank = accounts.find((a) => a.id === parsed.bankAccountId);
  if (!ar) {
    throw new Error("Accounts receivable (code 1100) is missing. Add it in Chart of Accounts.");
  }
  if (!bank) throw new Error("Bank account not found.");

  const contactId = await resolveContactId(parsed.customerName, "customer");
  const parts = [parsed.note, parsed.referenceInvoice ? `Ref: ${parsed.referenceInvoice}` : null]
    .filter(Boolean)
    .join(" — ");

  return saveDraftAction({
    intent: "record_payment",
    confidence: 1,
    contactId,
    entities: {
      amount: parsed.amount,
      currency: baseCurrency,
      date: parsed.paymentDate,
      counterparty: parsed.customerName,
      description: parts || "Payment received",
      tax: null,
    },
    accounts: {
      debit_account: suggestionForAccount(bank as Account),
      credit_account: suggestionForAccount(ar as Account),
    },
    receiptAllocationsDraft: parsed.allocations?.map((a) => ({
      invoice_id: a.invoiceId,
      allocated_amount: a.amount,
    })),
  });
}

export async function createGuidedPaymentSentAction(
  input: z.infer<typeof PaymentOutSchema>,
) {
  const parsed = PaymentOutSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");

  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);
  const accounts = await listAccounts();
  const ap = accounts.find((a) => a.code === "2000");
  const bank = accounts.find((a) => a.id === parsed.bankAccountId);
  if (!ap) {
    throw new Error("Accounts payable (code 2000) is missing. Add it in Chart of Accounts.");
  }
  if (!bank) throw new Error("Bank account not found.");

  const contactId = await resolveContactId(parsed.supplierName, "vendor");
  const parts = [parsed.note, parsed.referenceBill ? `Ref: ${parsed.referenceBill}` : null]
    .filter(Boolean)
    .join(" — ");

  return saveDraftAction({
    intent: "record_payment",
    confidence: 1,
    contactId,
    entities: {
      amount: parsed.amount,
      currency: baseCurrency,
      date: parsed.paymentDate,
      counterparty: parsed.supplierName,
      description: parts || "Payment sent",
      tax: null,
    },
    accounts: {
      debit_account: suggestionForAccount(ap as Account),
      credit_account: suggestionForAccount(bank as Account),
    },
    paymentAllocationsDraft: parsed.allocations?.map((a) => ({
      bill_id: a.billId,
      allocated_amount: a.amount,
    })),
  });
}
