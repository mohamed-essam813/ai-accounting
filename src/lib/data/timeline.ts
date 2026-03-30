import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type TimelineRow = Database["public"]["Tables"]["timeline_events"]["Row"];

export async function recordTimelineEvent(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string;
    eventType: string;
    referenceType: string;
    referenceId: string;
    description: string;
    eventDate: string;
  },
): Promise<void> {
  const { error } = await supabase.from("timeline_events").insert({
    tenant_id: params.tenantId,
    event_type: params.eventType,
    reference_type: params.referenceType,
    reference_id: params.referenceId,
    description: params.description,
    event_date: params.eventDate,
  });
  if (error) throw error;
}

export function draftIntentToTimelineEventType(intent: string): string {
  const map: Record<string, string> = {
    create_invoice: "invoice_posted",
    create_bill: "bill_posted",
    create_credit_note: "credit_note_posted",
    create_debit_note: "debit_note_posted",
    record_payment: "payment_posted",
    reconcile_bank: "bank_reconciliation_posted",
    generate_report: "journal_posted",
  };
  return map[intent] ?? "transaction_posted";
}

function formatMoney(amount: unknown, currency: unknown): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "";
  const cur = typeof currency === "string" && currency.length > 0 ? currency : "";
  const n = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur ? `${cur} ${n}` : n;
}

/**
 * User-facing timeline line when a draft is posted (PRD narrative style).
 */
export function buildDraftPostedTimelineDescription(
  intent: string,
  entities: Record<string, unknown>,
  journalDescription: string,
): string {
  const contact =
    (entities.contact_name as string) ||
    (entities.customer_name as string) ||
    (entities.supplier_name as string) ||
    (entities.vendor_name as string) ||
    "";
  const amount = formatMoney(entities.amount, entities.currency);
  const inv = (entities.invoice_number as string) || "";

  switch (intent) {
    case "create_invoice": {
      const tail = [contact && `— ${contact}`, amount && `— ${amount}`].filter(Boolean).join(" ");
      return inv ? `Invoice ${inv} posted ${tail}`.trim() : `Invoice posted ${tail}`.trim() || journalDescription;
    }
    case "create_bill": {
      const tail = [contact && `— ${contact}`, amount && `— ${amount}`].filter(Boolean).join(" ");
      return `Bill posted ${tail}`.trim() || journalDescription;
    }
    case "record_payment": {
      const parts = ["Payment recorded"];
      if (amount) parts.push(amount);
      if (contact) parts.push(contact);
      return parts.join(" — ") || journalDescription;
    }
    case "create_credit_note":
      return `Credit note posted${contact ? ` — ${contact}` : ""}${amount ? ` — ${amount}` : ""}`.trim();
    case "create_debit_note":
      return `Debit note posted${contact ? ` — ${contact}` : ""}${amount ? ` — ${amount}` : ""}`.trim();
    case "reconcile_bank":
      return `Bank activity posted — ${journalDescription}`;
    default:
      return journalDescription;
  }
}

export async function listTimelineEvents(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  limit = 100,
): Promise<TimelineRow[]> {
  const { data, error } = await supabase
    .from("timeline_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as TimelineRow[];
}
