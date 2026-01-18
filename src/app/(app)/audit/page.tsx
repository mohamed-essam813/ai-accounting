import { getRecentAuditEvents } from "@/lib/data/audit";
import { Input } from "@/components/ui/input";
import { AuditLogSearch } from "@/components/audit/audit-log-search";
import { AuditTableClient } from "@/components/audit/audit-table-client";

export const revalidate = 60;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    invoiceNumber?: string;
    billNumber?: string;
    contact?: string;
    amount?: string;
    date?: string;
    action?: string;
  }>;
}) {
  const params = await searchParams;
  const entries = await getRecentAuditEvents(100, params);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Audit Trail</h2>
        <p className="text-sm text-muted-foreground">
          Track who created, edited, and approved drafts. Search by invoice number, bill number, contact, amount, date, or action type.
        </p>
      </div>
      <AuditLogSearch
        initialSearch={params.search}
        initialInvoiceNumber={params.invoiceNumber}
        initialBillNumber={params.billNumber}
        initialContact={params.contact}
        initialAmount={params.amount}
        initialDate={params.date}
        initialAction={params.action}
      />
      <AuditTableClient entries={entries} />
    </div>
  );
}
