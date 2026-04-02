import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
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
      return;
    }
    if (!inv?.id) return;

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
    return;
  }
  if (!bill?.id) return;

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

/**
 * MVP `payments` row when a payment/receipt draft posts (`record_payment`).
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
      .select("id, code")
      .in("id", ids);
    const codeById = new Map((accs ?? []).map((a) => [a.id, a.code]));

    for (const line of lines ?? []) {
      const code = codeById.get(line.account_id) ?? "";
      const dr = Number(line.debit);
      const cr = Number(line.credit);
      if (code === "1000" && dr > 0) bankAccountId = line.account_id;
      if (code === "1000" && cr > 0) bankAccountId = line.account_id;
      if (code === "2000" && dr > 0) paymentType = "payment";
      if (code === "1100" && cr > 0) paymentType = "receipt";
    }
  }

  const voucherNumber = await nextDocumentNumber({
    tenantId,
    documentType: paymentType === "receipt" ? "receipt" : "payment",
    date: postingDate,
  });

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
    reference: (entities.reference as string | undefined) ?? null,
  })
    .select("id")
    .maybeSingle();

  if (error) console.error("[materialize] payments", error);

  // Materialize settlement allocations saved on the draft (optional).
  const paymentId = (payRow as { id?: string } | null)?.id ?? null;
  if (paymentId) {
    const draftData = params.draftData as Record<string, unknown>;
    if (paymentType === "receipt") {
      const allocs = draftData.receipt_allocations_draft as
        | Array<{ invoice_id: string; allocated_amount: number }>
        | undefined;
      if (allocs && allocs.length > 0) {
        const ra = supabase.from("receipt_allocations" as never) as unknown as {
          delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
          insert: (values: any[]) => Promise<{ error: unknown }>;
        };
        await ra.delete().eq("receipt_id", paymentId);
        const rows = allocs.map((a) => ({
          tenant_id: tenantId,
          receipt_id: paymentId,
          invoice_id: a.invoice_id,
          allocated_amount: a.allocated_amount,
        }));
        const { error: aErr } = await ra.insert(rows);
        if (aErr) console.error("[materialize] receipt_allocations", aErr);
      }
    } else {
      const allocs = draftData.payment_allocations_draft as
        | Array<{ bill_id: string; allocated_amount: number }>
        | undefined;
      if (allocs && allocs.length > 0) {
        const pa = supabase.from("payment_allocations" as never) as unknown as {
          delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
          insert: (values: any[]) => Promise<{ error: unknown }>;
        };
        await pa.delete().eq("payment_id", paymentId);
        const rows = allocs.map((a) => ({
          tenant_id: tenantId,
          payment_id: paymentId,
          bill_id: a.bill_id,
          allocated_amount: a.allocated_amount,
        }));
        const { error: aErr } = await pa.insert(rows);
        if (aErr) console.error("[materialize] payment_allocations", aErr);
      }
    }
  }
}
