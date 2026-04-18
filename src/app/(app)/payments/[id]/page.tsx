import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { DocumentDetailView } from "@/components/documents/document-detail-view";
import type { WorkflowUiStatus } from "@/components/documents/document-workflow-badge";

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user?.tenant) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: pay, error } = await supabase.from("payments").select("*").eq("id", id).eq("tenant_id", user.tenant.id).maybeSingle();

  if (error || !pay) notFound();

  const { data: je } = await supabase
    .from("journal_entries")
    .select("id, status")
    .eq("id", pay.journal_entry_id)
    .maybeSingle();

  let status: WorkflowUiStatus = "posted";
  if (je?.status === "void") status = "voided";

  let contactName: string | null = null;
  if (pay.contact_id) {
    const { data: c } = await supabase.from("contacts").select("name").eq("id", pay.contact_id).maybeSingle();
    contactName = c?.name ?? null;
  }

  const dir = pay.payment_type === "payment" ? "Money out" : "Money in";

  return (
    <DocumentDetailView
      breadcrumbListHref="/payments"
      breadcrumbListLabel="Payments"
      documentNumber={pay.voucher_number}
      documentTitle={contactName ? `Payment (${dir}) — ${contactName}` : `Payment (${dir})`}
      status={status}
      pdfHref={`/api/payments/${id}/pdf`}
      journalEntryId={pay.journal_entry_id}
      entityLabel="payment"
    />
  );
}
