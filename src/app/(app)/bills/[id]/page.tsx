import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { DocumentDetailView } from "@/components/documents/document-detail-view";
import type { WorkflowUiStatus } from "@/components/documents/document-workflow-badge";

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user?.tenant) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: bill, error } = await supabase.from("bills").select("*").eq("id", id).eq("tenant_id", user.tenant.id).maybeSingle();

  if (error || !bill) notFound();

  const { data: je } = await supabase
    .from("journal_entries")
    .select("id, status")
    .eq("id", bill.journal_entry_id)
    .maybeSingle();

  let status: WorkflowUiStatus = "posted";
  if (je?.status === "void") status = "voided";
  if ((bill.status || "").toLowerCase() === "reversed") status = "reversed";

  let vendorName: string | null = null;
  if (bill.supplier_id) {
    const { data: c } = await supabase.from("contacts").select("name").eq("id", bill.supplier_id).maybeSingle();
    vendorName = c?.name ?? null;
  }

  return (
    <DocumentDetailView
      breadcrumbListHref="/bills"
      breadcrumbListLabel="Bills"
      documentNumber={bill.bill_number}
      documentTitle={vendorName ? `Bill — ${vendorName}` : "Bill"}
      status={status}
      pdfHref={`/api/bills/${id}/pdf`}
      journalEntryId={bill.journal_entry_id}
      entityLabel="bill"
    />
  );
}
