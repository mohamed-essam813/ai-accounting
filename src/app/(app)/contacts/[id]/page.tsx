import Link from "next/link";
import { notFound } from "next/navigation";
import { getContactById, getContactTransactionCounts, getContactOutstandingTotal } from "@/lib/data/contacts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatementOfAccount } from "@/components/contacts/statement-of-account";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { ContactDetailActions } from "@/components/contacts/contact-detail-actions";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContactById(id);
  if (!contact) notFound();

  const [counts, outstanding] = await Promise.all([
    getContactTransactionCounts(id),
    getContactOutstandingTotal(id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold">{contact.name}</h2>
            <span className="font-mono text-sm text-muted-foreground">{contact.code}</span>
            {contact.is_active ? (
              <Badge variant="outline">Active</Badge>
            ) : (
              <Badge variant="secondary">Deactivated</Badge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {contact.is_customer ? <Badge>customer</Badge> : null}
            {contact.is_vendor ? <Badge variant="secondary">vendor</Badge> : null}
            {contact.is_employee ? <Badge variant="outline">employee</Badge> : null}
          </div>
        </div>
        <ContactDetailActions contact={contact} outstanding={outstanding} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3 text-sm">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Outstanding AR</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{formatCurrency(outstanding.ar)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Outstanding AP</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{formatCurrency(outstanding.ap)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Documents</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Invoices {counts.invoices} · Bills {counts.bills} · Payments {counts.payments}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Email</span>
                <div>{contact.email ?? "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Phone</span>
                <div>{contact.phone ?? "—"}</div>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Address</span>
                <div>{contact.address ?? "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">TRN</span>
                <div>{contact.trn ?? "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Emirate</span>
                <div>{contact.emirate ?? "—"}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Journal entries linked to this contact: {counts.journals}</CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
        <TabsContent value="statement">
          <StatementOfAccount contact={contact} />
        </TabsContent>
      </Tabs>

      <div className="flex gap-2">
        <Button variant="outline" asChild>
          <Link href={`/prompt`}>Record activity</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/contacts">Back to contacts</Link>
        </Button>
      </div>
    </div>
  );
}
