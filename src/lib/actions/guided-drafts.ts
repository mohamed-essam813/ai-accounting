"use server";

import { z } from "zod";
import { saveDraftAction } from "@/lib/actions/drafts";
import { createContactAction } from "@/lib/actions/contacts";
import { listAccounts } from "@/lib/data/accounts";
import { listContacts } from "@/lib/data/contacts";
import { listTaxRates, getTaxRateById } from "@/lib/data/tax-rates";
import { getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { getCurrentUser } from "@/lib/data/users";
import type { Account } from "@/lib/accounting";
import { filterBankReconciliationAccounts } from "@/lib/accounting/is-bank-account";
import type { DraftPayload } from "@/lib/ai/schema";
import { getBusinessItemById, getInventoryBalance, getInventoryItem } from "@/lib/data/inventory";
import { round2 } from "@/lib/posting/posting-engine";
import { buildTransactionAmounts, validateTransactionAmountsMatch } from "@/lib/posting/transaction-amounts";

type AccountSuggestion = NonNullable<DraftPayload["accounts"]>["debit_account"];

function suggestionForAccount(acc: Account): AccountSuggestion {
  const st = acc.type as AccountSuggestion["suggested_type"];
  return {
    suggested_name: acc.name,
    suggested_type: st,
    suggested_category: st === "asset" || st === "liability" ? "current" : null,
    existing_account_id: acc.id,
    confidence: 1,
  };
}

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

async function buildBillAccounts(
  accounts: Account[],
  expenseAccountId: string | null,
  taxRateId: string | null,
): Promise<NonNullable<DraftPayload["accounts"]>> {
  const ap = accounts.find((a) => a.code === "2000");
  const expense = expenseAccountId
    ? accounts.find((a) => a.id === expenseAccountId)
    : accounts.find((a) => a.code === "5000");
  if (!ap) {
    throw new Error("Accounts payable (code 2000) is missing.");
  }
  if (!expense) {
    throw new Error("Expense account is missing. Set it on the item or add code 5000.");
  }
  let taxDebit: AccountSuggestion | undefined;
  if (taxRateId) {
    const tr = await getTaxRateById(taxRateId);
    if (tr?.input_vat_account_id) {
      const acc = accounts.find((a) => a.id === tr.input_vat_account_id);
      if (acc) taxDebit = suggestionForAccount(acc);
    }
  }
  return {
    debit_account: suggestionForAccount(expense),
    credit_account: suggestionForAccount(ap),
    tax_debit_account: taxDebit,
    tax_credit_account: undefined,
  };
}

async function resolveContactId(
  name: string,
  kind: "customer" | "vendor",
): Promise<string> {
  const contacts = await listContacts();
  const n = name.trim().toLowerCase();
  const hit = contacts.find((c) => c.name.toLowerCase() === n);
  if (hit) return hit.id;
  const row = await createContactAction({
    name: name.trim(),
    type: kind === "customer" ? "customer" : "vendor",
    email: "",
    phone: "",
    address: "",
    tax_id: "",
  });
  if (!row?.id) throw new Error("Could not create contact.");
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
  return contacts.map((c) => ({ id: c.id, name: c.name, type: c.type }));
}

export async function listBankAccountsForPickerAction(): Promise<
  { id: string; name: string; code: string }[]
> {
  const accounts = await listAccounts();
  const banks = filterBankReconciliationAccounts(accounts as Account[]);
  return banks.map((a) => ({ id: a.id, name: a.name, code: a.code }));
}

export async function createContactFromPickerAction(
  name: string,
  kind: "customer" | "vendor",
) {
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Not signed in.");
  const row = await createContactAction({
    name: name.trim(),
    type: kind === "customer" ? "customer" : "vendor",
    email: "",
    phone: "",
    address: "",
    tax_id: "",
  });
  if (!row?.id) throw new Error("Could not create contact.");
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

  const match = validateTransactionAmountsMatch(expectedAmounts, parsed.transactionAmounts);
  if (!match.ok) {
    throw new Error(match.error);
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
    const balance = await getInventoryBalance(item.id);
    const q = balance?.quantity ?? 0;
    const tv = balance?.total_value ?? 0;
    const fromAvg = balance?.average_cost != null ? Number(balance.average_cost) : null;
    const fromQv = q > 0 ? tv / q : null;
    costPrice = round2(Number(fromAvg ?? fromQv ?? item.cost_price ?? 0));
    cogsAmount = round2(parsed.quantity! * costPrice);
    margin = round2(expectedAmounts.subtotal_amount - cogsAmount);
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

  return saveDraftAction({
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

  const expectedAmounts = buildTransactionAmounts({
    entered_amount: parsed.enteredAmount,
    tax_rate: taxPct,
    tax_treatment: parsed.taxTreatment,
  });
  const match = validateTransactionAmountsMatch(expectedAmounts, parsed.transactionAmounts);
  if (!match.ok) {
    throw new Error(match.error);
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
      amount: parsed.enteredAmount,
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
