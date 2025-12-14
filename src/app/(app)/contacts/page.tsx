import { listContacts } from "@/lib/data/contacts";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const revalidate = 60;

export default async function ContactsPage() {
  const contacts = await listContacts();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Contacts</h2>
        <p className="text-sm text-muted-foreground">
          Manage customers, vendors, and other contacts. Contact codes are auto-generated (CUST-001, SUP-001, etc.).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactsTable contacts={contacts} />
        </CardContent>
      </Card>
    </div>
  );
}
