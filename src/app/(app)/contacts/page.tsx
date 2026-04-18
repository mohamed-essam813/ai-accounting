import { Suspense } from "react";
import { listContacts } from "@/lib/data/contacts";
import type { ContactListFilter, ContactListSort } from "@/lib/data/contacts";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/data/users";
import type { UserRole } from "@/lib/auth";

export const revalidate = 60;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string; search?: string }>;
}) {
  const sp = await searchParams;
  const filter = (sp.filter as ContactListFilter) || "all";
  const sort = (sp.sort as ContactListSort) || "name_asc";
  const search = sp.search;

  const [contacts, user] = await Promise.all([
    listContacts({
      filter,
      sort,
      search,
      includeInactive: filter === "deactivated",
    }),
    getCurrentUser(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Contacts</h2>
        <p className="text-sm text-muted-foreground">
          Customers, vendors, and employees — multi-role contacts, UAE VAT fields, and soft deactivation only.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <ContactsTable contacts={contacts} userRole={(user?.role as UserRole) ?? "business_user"} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
