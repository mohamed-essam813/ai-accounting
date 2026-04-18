"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { usePagination } from "@/hooks/use-pagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import Link from "next/link";

type AuditEntry = {
  id: string;
  created_at: string;
  actor_email?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  document_number?: string | null;
  changesSummary?: string | null;
  entity_display_label?: string | null;
  entity_href?: string | null;
};

type Props = {
  entries: AuditEntry[];
};

export function AuditTableClient({ entries }: Props) {
  const {
    currentItems: paginatedEntries,
    currentPage,
    totalPages,
    goToPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePagination({ data: entries, itemsPerPage: 50 });

  return (
    <>
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
            {paginatedEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  No audit events yet.
                </TableCell>
              </TableRow>
            ) : (
              paginatedEntries.map((entry) => (
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
                    <span className="text-sm" title={entry.entity_id ? `Entity id: ${entry.entity_id}` : undefined}>
                      {entry.entity_href ? (
                        <Link href={entry.entity_href} className="text-primary hover:underline decoration-dotted">
                          {entry.entity_display_label ?? entry.entity}
                        </Link>
                      ) : (
                        <span>{entry.entity_display_label ?? entry.entity}</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {entry.document_number ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xl truncate text-xs text-muted-foreground">
                    {entry.changesSummary || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {entries.length > 0 && (
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={entries.length}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      )}
    </>
  );
}
