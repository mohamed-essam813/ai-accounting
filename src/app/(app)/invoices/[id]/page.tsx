import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { DocumentDetailView } from "@/components/documents/document-detail-view";
import type { WorkflowUiStatus } from "@/components/documents/document-workflow-badge";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user?.tenant) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: inv, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error || !inv) notFound();

  const { data: je } = await supabase
    .from("journal_entries")
    .select("id, status")
    .eq("id", inv.journal_entry_id)
    .maybeSingle();

  let status: WorkflowUiStatus = "posted";
  if (je?.status === "void") status = "voided";
  if ((inv.status || "").toLowerCase() === "reversed") status = "reversed";

  let customerName: string | null = null;
  if (inv.customer_id) {
    const { data: c } = await supabase.from("contacts").select("name").eq("id", inv.customer_id).maybeSingle();
    customerName = c?.name ?? null;
  }

  return (
    <DocumentDetailView
      breadcrumbListHref="/invoices"
      breadcrumbListLabel="Invoices"
      documentNumber={inv.invoice_number}
      documentTitle={customerName ? `Invoice — ${customerName}` : "Invoice"}
      status={status}
      pdfHref={`/api/invoices/${id}/pdf`}
      journalEntryId={inv.journal_entry_id}
      entityLabel="invoice"
    />
  );
}
