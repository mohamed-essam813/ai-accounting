import { getRecentAuditEvents } from "@/lib/data/audit";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { AuditLogSearch } from "@/components/audit/audit-log-search";

export const revalidate = 60;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { search?: string };
}) {
  const searchQuery = searchParams.search;
  const entries = await getRecentAuditEvents(100, searchQuery);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Audit Trail</h2>
        <p className="text-sm text-muted-foreground">
          Track who created, edited, and approved drafts. Search by invoice number, bill number, user, or date.
        </p>
      </div>
      <AuditLogSearch initialSearch={searchQuery} />
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Document Number</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  {searchQuery ? "No audit events found matching your search." : "No audit events yet."}
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(entry.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.actor_email ?? "System"}
                  </TableCell>
                  <TableCell className="font-medium capitalize">
                    {entry.action.replace(/\./g, " ")}
                  </TableCell>
                  <TableCell>
                    {entry.entity}
                    {entry.entity_id ? ` (${entry.entity_id.slice(0, 8)}…)` : ""}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {entry.document_number ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xl truncate text-xs text-muted-foreground">
                    {entry.changesSummary}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
