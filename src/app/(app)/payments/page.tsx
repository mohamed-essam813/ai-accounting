import Link from "next/link";
import { listPostedPayments } from "@/lib/data/payments-list";
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

export default async function PaymentsPage() {
  const payments = await listPostedPayments(300);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Payments</h2>
        <p className="text-sm text-muted-foreground">
          Receipts and payments materialized when payment drafts post (MVP <code className="text-xs">payments</code>{" "}
          table).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posted payments</CardTitle>
          <CardDescription>Linked to journal entries.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payment rows yet. Post a payment draft (receive money / pay supplier) to create entries.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{p.payment_date}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {p.payment_type === "receipt" ? "Receipt" : "Payment"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{p.contact_name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {p.currency_code ?? ""} {Number(p.amount).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {p.reference ?? "—"}
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
