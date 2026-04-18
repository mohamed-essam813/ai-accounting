import Link from "next/link";
import { redirect } from "next/navigation";
import { findDuplicatePairsForAdmin, getContactTransactionCounts } from "@/lib/data/contacts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts, type UserRole } from "@/lib/auth";
import { MergeContactsRow } from "@/components/contacts/merge-contacts-row";

export default async function ContactDuplicatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!canManageAccounts(user.role as UserRole)) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Only administrators can review duplicate pairs.
      </div>
    );
  }

  const pairs = await findDuplicatePairsForAdmin();

  const enriched = await Promise.all(
    pairs.map(async (p) => {
      const [ca, cb] = await Promise.all([
        getContactTransactionCounts(p.a.id),
        getContactTransactionCounts(p.b.id),
      ]);
      return { ...p, ca, cb };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Duplicate pairs</h2>
        <p className="text-sm text-muted-foreground">
          Name similarity ≥ 85%. Merge is irreversible for the merged record (soft-deactivated with audit).
        </p>
      </div>
      <Button variant="outline" asChild>
        <Link href="/contacts">← Back to contacts</Link>
      </Button>
      <div className="space-y-4">
        {enriched.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No high-similarity pairs found.
            </CardContent>
          </Card>
        ) : (
          enriched.map((row) => (
            <Card key={`${row.a.id}-${row.b.id}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  {Math.round(row.ratio * 100)}% similar · {row.a.name} ↔ {row.b.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MergeContactsRow pair={row} />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
