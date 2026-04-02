import Link from "next/link";
import { listPostedInvoices } from "@/lib/data/invoices-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileDown } from "lucide-react";
import { formatSettlementStatusLabel } from "@/lib/accounting/settlement-status-label";

export const revalidate = 60;

export default async function InvoicesPage() {
  const invoices = await listPostedInvoices(200);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Invoices</h2>
        <p className="text-sm text-muted-foreground">
          Posted sales invoices (materialized when invoice drafts post). Download PDF per BRD.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posted invoices</CardTitle>
          <CardDescription>Linked to journal entries and drafts.</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invoices yet. Post an invoice draft to create a row here.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">
                        {inv.invoice_number ?? "—"}
                      </TableCell>
                      <TableCell>{inv.invoice_date}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {inv.currency_code ?? ""} {Number(inv.total_amount).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {inv.currency_code ?? ""} {Number(inv.amount_received).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {inv.currency_code ?? ""} {Number(inv.outstanding_amount).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatSettlementStatusLabel(inv.settlement_status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                            <FileDown className="h-4 w-4 mr-1" />
                            PDF
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Underlying entry:{" "}
            <Link href="/journals" className="text-primary underline">
              Journals
            </Link>
            , timeline:{" "}
            <Link href="/timeline" className="text-primary underline">
              Timeline
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
