import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { inferReceiptAllocationsForPosting } from "@/lib/posting/receipt-allocation-inference";
import {
  deriveDocumentTotalsForMaterialize,
  lineNetAmountFromInventoryLine,
  type DraftInventoryLine,
} from "@/lib/posting/materialize-amounts";
import { parseBillDocumentLines, parseInvoiceDocumentLines } from "@/lib/posting/multi-line-documents";
import { nextDocumentNumber } from "@/lib/utils/document-numbers";

type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];

/**
 * Persist MVP-schema `invoices` / `bills` (+ line items) when a draft posts.
 * Idempotent per journal_entry_id (unique index).
 */
export async function materializeInvoiceOrBillFromPostedDraft(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string;
    draft: DraftsRow;
    journalEntryId: string;
    postingDate: string;
    description: string;
    entities: Record<string, unknown>;
    draftData: Record<string, unknown>;
  },
): Promise<void> {
  const { draft, journalEntryId, tenantId, postingDate, entities, draftData } = params;
  const intent = draft.intent;

  if (intent !== "create_invoice" && intent !== "create_bill") {
    return;
  }

  const taxObj = entities.tax as { amount?: number | null } | undefined;
  const taxFromEntities = typeof taxObj?.amount === "number" ? taxObj.amount : null;
  const taxFromDraft = draftData.tax_amount as number | undefined;
  const txDraft = draftData.transaction_amounts as
    | { subtotal_amount: number; tax_amount: number; total_amount: number }
    | undefined;
  const { subtotal, taxAmount, totalAmount } = deriveDocumentTotalsForMaterialize({
    taxTreatment: (draft as { tax_treatment?: string | null }).tax_treatment as
      | "exclusive"
      | "inclusive"
      | null
      | undefined,
    entitiesAmount: Number(entities.amount ?? 0),
    entitiesTaxAmount: taxFromEntities,
    draftTaxAmountFallback: taxFromDraft,
    transactionAmounts: txDraft,
  });
  const currencyCode =
    (entities.currency as string) ||
    (draftData.currency as string | undefined) ||
    null;
  const dueRaw = entities.due_date as string | null | undefined;
  const invoiceNumberFromDraft = (entities.invoice_number as string | null | undefined) ?? null;
  const taxMeta = draftData.tax as { tax_rate_id?: string } | undefined;
  const taxRateId = taxMeta?.tax_rate_id ?? null;

  const contactId =
    (draft as { contact_id?: string | null }).contact_id ??
    (entities.contact_id as string | undefined) ??
    null;

  const inventoryLineItems = draftData.inventory_line_items as
    | DraftInventoryLine[]
    | undefined;

  if (intent === "create_invoice") {
    const { data: existing } = await supabase
      .from("invoices")
      .select("id")
      .eq("journal_entry_id", journalEntryId)
      .maybeSingle();
    if (existing) return;

    const invNumber =
      invoiceNumberFromDraft ??
      (await nextDocumentNumber({
        tenantId,
        documentType: "invoice",
        date: postingDate,
      }));

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .insert({
        tenant_id: tenantId,
        draft_id: draft.id,
        journal_entry_id: journalEntryId,
        customer_id: contactId,
        invoice_number: invNumber,
        invoice_date: postingDate,
        due_date: dueRaw ?? null,
        currency_code: currencyCode,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        amount_received: 0,
        outstanding_amount: totalAmount,
        settlement_status: "unpaid",
        status: "posted",
      })
      .select("id")
      .single();

    if (invErr) {
      console.error("[materialize] invoice insert", invErr);
      throw invErr;
    }
    if (!inv?.id) {
      throw new Error("Invoice materialization returned no id.");
    }

    const docInvLines = draftData.document_line_items;
    if (Array.isArray(docInvLines) && docInvLines.length > 0) {
      try {
        const parsed = parseInvoiceDocumentLines(docInvLines);
        const rows = parsed.map((l) => ({
          invoice_id: inv.id,
          product_id: l.item_id,
          description: l.description,
          quantity: l.quantity ?? 1,
          unit_price: Number(l.unit_price ?? l.line_net / Math.max(l.quantity ?? 1, 1)),
          tax_rate_id: l.tax_rate_id ?? taxRateId,
          line_total: l.line_net,
        }));
        const { error: liErr } = await supabase.from("invoice_items").insert(rows);
        if (liErr) console.error("[materialize] invoice_items multi", liErr);
      } catch (e) {
        console.error("[materialize] invoice multi-line parse", e);
      }
    } else if (inventoryLineItems && inventoryLineItems.length > 0) {
      const rows = inventoryLineItems.map((line) => ({
        invoice_id: inv.id,
        product_id: line.item_id,
        description: line.item_name,
        quantity: line.quantity,
        unit_price: Number(line.unit_price ?? line.rate),
        tax_rate_id: taxRateId,
        line_total: lineNetAmountFromInventoryLine(line),
      }));
      const { error: liErr } = await supabase.from("invoice_items").insert(rows);
      if (liErr) console.error("[materialize] invoice_items", liErr);
    } else {
      const { error: liErr } = await supabase.from("invoice_items").insert({
        invoice_id: inv.id,
        description: (entities.description as string) || params.description || "Invoice line",
        quantity: 1,
        unit_price: subtotal,
        tax_rate_id: taxRateId,
        line_total: subtotal,
      });
      if (liErr) console.error("[materialize] invoice_items single", liErr);
    }
    return;
  }

  // create_bill
  const { data: existingBill } = await supabase
    .from("bills")
    .select("id")
    .eq("journal_entry_id", journalEntryId)
    .maybeSingle();
  if (existingBill) return;

  const billNumber =
    (draftData.bill_number as string | undefined | null) ??
    (await nextDocumentNumber({
      tenantId,
      documentType: "bill",
      date: postingDate,
    }));

  const { data: bill, error: billErr } = await supabase
    .from("bills")
    .insert({
      tenant_id: tenantId,
      draft_id: draft.id,
      journal_entry_id: journalEntryId,
      supplier_id: contactId,
      bill_number: billNumber,
      bill_date: postingDate,
      due_date: dueRaw ?? null,
      currency_code: currencyCode,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      amount_paid: 0,
      outstanding_amount: totalAmount,
      settlement_status: "unpaid",
      status: "posted",
    })
    .select("id")
    .single();

  if (billErr) {
    console.error("[materialize] bill insert", billErr);
    throw billErr;
  }
  if (!bill?.id) {
    throw new Error("Bill materialization returned no id.");
  }

  const docBillLines = draftData.document_line_items;
  if (Array.isArray(docBillLines) && docBillLines.length > 0) {
    try {
      const parsed = parseBillDocumentLines(docBillLines);
      const rows = parsed.map((l) => ({
        bill_id: bill.id,
        product_id: l.classification === "inventory" ? l.item_id ?? null : null,
        description: `[${l.classification}] ${l.description}`,
        quantity: l.classification === "inventory" ? l.quantity ?? 1 : 1,
        unit_cost:
          l.classification === "inventory"
            ? Number(l.unit_price ?? 0)
            : l.line_net,
        tax_rate_id: l.tax_rate_id ?? taxRateId,
        line_total: l.line_net,
      }));
      const { error: biErr } = await supabase.from("bill_items").insert(rows);
      if (biErr) console.error("[materialize] bill_items multi", biErr);
    } catch (e) {
      console.error("[materialize] bill multi-line parse", e);
    }
  } else if (inventoryLineItems && inventoryLineItems.length > 0) {
    const rows = inventoryLineItems.map((line) => ({
      bill_id: bill.id,
      product_id: line.item_id,
      description: line.item_name,
      quantity: line.quantity,
      unit_cost: Number(line.unit_price ?? line.rate),
      tax_rate_id: taxRateId,
      line_total: lineNetAmountFromInventoryLine(line),
    }));
    const { error: biErr } = await supabase.from("bill_items").insert(rows);
    if (biErr) console.error("[materialize] bill_items", biErr);
  } else {
    const { error: biErr } = await supabase.from("bill_items").insert({
      bill_id: bill.id,
      description: (entities.description as string) || params.description || "Bill line",
      quantity: 1,
      unit_cost: subtotal,
      tax_rate_id: taxRateId,
      line_total: subtotal,
    });
    if (biErr) console.error("[materialize] bill_items single", biErr);
  }
}

type CoaLite = {
  id: string;
  code: string;
  type: string;
  detail_type: string | null;
  prd_account_kind: string | null;
};

function isBankCashLine(acc: CoaLite): boolean {
  if (acc.detail_type === "bank" || acc.prd_account_kind === "bank" || acc.prd_account_kind === "cash") {
    return true;
  }
  const n = parseInt(acc.code, 10);
  if (acc.type === "asset" && !Number.isNaN(n) && n >= 1000 && n < 1200) {
    return true;
  }
  return acc.code === "1000";
}

/**
 * MVP `payments` row when a payment/receipt draft posts (`record_payment`).
 * Creates receipt/payment document, allocations, and relies on DB triggers to update invoice/bill settlement.
 */
export async function materializePaymentFromPostedDraft(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string;
    draft: DraftsRow;
    journalEntryId: string;
    postingDate: string;
    entities: Record<string, unknown>;
    draftData: Record<string, unknown>;
  },
): Promise<void> {
  const { draft, journalEntryId, tenantId, postingDate, entities } = params;
  if (draft.intent !== "record_payment") return;

  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("journal_entry_id", journalEntryId)
    .maybeSingle();
  if (existing) return;

  const amount = Math.abs(Number(entities.amount ?? 0));
  if (amount <= 0) {
    throw new Error("Payment amount must be greater than zero to post.");
  }

  const currencyCode =
    (entities.currency as string) ||
    (params.draftData.currency as string | undefined) ||
    null;
  const contactId =
    (draft as { contact_id?: string | null }).contact_id ??
    (entities.contact_id as string | undefined) ??
    null;

  const { data: lines } = await supabase
    .from("journal_lines")
    .select("account_id, debit, credit")
    .eq("entry_id", journalEntryId);

  const ids = [...new Set((lines ?? []).map((l) => l.account_id))];
  let bankAccountId: string | null = null;
  let paymentType: "receipt" | "payment" = "receipt";

  if (ids.length > 0) {
    const { data: accs } = await supabase
      .from("chart_of_accounts")
      .select("id, code, type, detail_type, prd_account_kind")
      .in("id", ids);
    const accById = new Map((accs ?? []).map((a) => [a.id, a as CoaLite]));

    for (const line of lines ?? []) {
      const acc = accById.get(line.account_id);
      if (!acc) continue;
      const dr = Number(line.debit);
      const cr = Number(line.credit);
      const isAp =
        acc.prd_account_kind === "accounts_payable" ||
        acc.code === "2000" ||
        (acc.type === "liability" && acc.code.startsWith("200"));
      const isAr =
        acc.prd_account_kind === "accounts_receivable" ||
        acc.code === "1100" ||
        (acc.type === "asset" && acc.code.startsWith("110"));

      if (isAp && dr > 0) paymentType = "payment";
      if (isAr && cr > 0) paymentType = "receipt";

      if (isBankCashLine(acc)) {
        if (paymentType === "receipt" && dr > 0) bankAccountId = line.account_id;
        if (paymentType === "payment" && cr > 0) bankAccountId = line.account_id;
      }
    }
  }

  const voucherNumber = await nextDocumentNumber({
    tenantId,
    documentType: paymentType === "receipt" ? "receipt" : "payment",
    date: postingDate,
  });

  const draftData = params.draftData as Record<string, unknown>;
  let referenceText =
    (typeof entities.reference === "string" && entities.reference.trim()
      ? entities.reference
      : null) ?? null;

  const { data: payRow, error } = await supabase
    .from("payments")
    .insert({
      tenant_id: tenantId,
      draft_id: draft.id,
      journal_entry_id: journalEntryId,
      contact_id: contactId,
      payment_type: paymentType,
      voucher_number: voucherNumber,
      bank_account_id: bankAccountId,
      amount,
      currency_code: currencyCode,
      payment_date: postingDate,
      reference: referenceText,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[materializePayment] payments insert failed", {
      draft_id: draft.id,
      journal_entry_id: journalEntryId,
      error,
    });
    throw error;
  }

  const paymentId = payRow?.id ?? null;
  if (!paymentId) {
    throw new Error("Failed to create payment record.");
  }

  console.log("[materializePayment] receipt/payment created", {
    draft_id: draft.id,
    customer_id: contactId,
    bank_account_id: bankAccountId,
    amount,
    payment_type: paymentType,
    receipt_id: paymentId,
    voucher_number: voucherNumber,
  });

  if (paymentType === "receipt") {
    let allocs = draftData.receipt_allocations_draft as
      | Array<{ invoice_id: string; allocated_amount: number }>
      | undefined;
    if (!Array.isArray(allocs) || allocs.length === 0) {
      allocs = await inferReceiptAllocationsForPosting(supabase, {
        tenantId,
        contactId,
        paymentAmount: amount,
        entities,
        draftData,
      });
      if (allocs.length > 0) {
        console.log("[materializePayment] inferred receipt_allocations (draft had none)", {
          draft_id: draft.id,
          allocations: allocs,
        });
      }
    }

    if (allocs && allocs.length > 0) {
      const { error: delErr } = await supabase.from("receipt_allocations").delete().eq("receipt_id", paymentId);
      if (delErr) {
        console.error("[materializePayment] receipt_allocations delete", delErr);
        throw delErr;
      }
      const rows = allocs.map((a) => ({
        tenant_id: tenantId,
        receipt_id: paymentId,
        invoice_id: a.invoice_id,
        allocated_amount: a.allocated_amount,
      }));
      const { data: insertedAllocs, error: aErr } = await supabase
        .from("receipt_allocations")
        .insert(rows)
        .select("id, invoice_id, allocated_amount");
      if (aErr) {
        console.error("[materializePayment] receipt_allocations insert", aErr);
        throw aErr;
      }
      console.log("[materializePayment] receipt_allocations rows", {
        receipt_id: paymentId,
        rows: insertedAllocs,
      });

      for (const row of rows) {
        const { data: invAfter } = await supabase
          .from("invoices")
          .select("id, amount_received, outstanding_amount, settlement_status")
          .eq("id", row.invoice_id)
          .maybeSingle();
        console.log("[materializePayment] invoice after allocation", {
          invoice_id: row.invoice_id,
          amount_received: invAfter?.amount_received,
          outstanding_amount: invAfter?.outstanding_amount,
          settlement_status: invAfter?.settlement_status,
        });
      }

      if (!referenceText && rows.length > 0) {
        const invIds = [...new Set(rows.map((r) => r.invoice_id))];
        const { data: invLabels } = await supabase
          .from("invoices")
          .select("invoice_number")
          .in("id", invIds);
        const label = (invLabels ?? [])
          .map((r) => r.invoice_number)
          .filter(Boolean)
          .join(", ");
        if (label) {
          await supabase.from("payments").update({ reference: label }).eq("id", paymentId);
        }
      }
    }
  } else {
    const allocs = draftData.payment_allocations_draft as
      | Array<{ bill_id: string; allocated_amount: number }>
      | undefined;
    if (allocs && allocs.length > 0) {
      const { error: delErr } = await supabase.from("payment_allocations").delete().eq("payment_id", paymentId);
      if (delErr) {
        console.error("[materializePayment] payment_allocations delete", delErr);
        throw delErr;
      }
      const rows = allocs.map((a) => ({
        tenant_id: tenantId,
        payment_id: paymentId,
        bill_id: a.bill_id,
        allocated_amount: a.allocated_amount,
      }));
      const { error: aErr } = await supabase.from("payment_allocations").insert(rows);
      if (aErr) {
        console.error("[materializePayment] payment_allocations insert", aErr);
        throw aErr;
      }
      console.log("[materializePayment] payment_allocations inserted", { payment_id: paymentId, count: rows.length });
    }
  }
}
