import { getRecentAuditEvents } from "@/lib/data/audit";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export const revalidate = 60;

export default async function AuditPage() {
  const entries = await getRecentAuditEvents(100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Audit Trail</h2>
        <p className="text-sm text-muted-foreground">
          Every system action is captured for review. Data is immutable and scoped per tenant.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  No audit events yet.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(entry.created_at)}
                  </TableCell>
                  <TableCell className="font-medium">{entry.action}</TableCell>
                  <TableCell>
                    {entry.entity}
                    {entry.entity_id ? ` (${entry.entity_id.slice(0, 8)}…)` : ""}
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

