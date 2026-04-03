import Link from "next/link";
import { listPostedReceipts } from "@/lib/data/receipts-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const revalidate = 60;

export default async function ReceiptsPage() {
  const receipts = await listPostedReceipts(300);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Receipts</h2>
        <p className="text-sm text-muted-foreground">
          Money received from customers. Posted from payment drafts (Receive money).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posted receipts</CardTitle>
          <CardDescription>
            Linked to journal entries; allocations update invoice balances when you apply receipts to invoices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No receipt rows yet. Post a “Payment received” draft to create entries.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>No.</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{p.payment_date}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {(p as { voucher_number?: string | null }).voucher_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{p.contact_name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {p.currency_code ?? ""} {Number(p.amount).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {p.reference ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">Receipt</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <a
                          href={`/api/receipts/${p.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          PDF
                        </a>
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

