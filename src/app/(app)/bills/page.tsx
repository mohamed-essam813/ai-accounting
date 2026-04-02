import Link from "next/link";
import { listPostedBills } from "@/lib/data/bills-list";
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

export default async function BillsPage() {
  const bills = await listPostedBills(200);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Bills</h2>
        <p className="text-sm text-muted-foreground">
          Posted supplier bills (materialized when bill drafts post). Download PDF.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posted bills</CardTitle>
          <CardDescription>Linked to journal entries and drafts.</CardDescription>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bills yet. Post a bill draft to create a row here.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-mono text-sm">
                        {bill.bill_number ?? "—"}
                      </TableCell>
                      <TableCell>{bill.bill_date}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {bill.currency_code ?? ""} {Number(bill.total_amount).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {bill.currency_code ?? ""} {Number(bill.amount_paid).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {bill.currency_code ?? ""} {Number(bill.outstanding_amount).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatSettlementStatusLabel(bill.settlement_status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/api/bills/${bill.id}/pdf`} target="_blank" rel="noreferrer">
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
            <Link href="/journals" className="text-primary underline">
              Journals
            </Link>
            {" · "}
            <Link href="/timeline" className="text-primary underline">
              Timeline
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
