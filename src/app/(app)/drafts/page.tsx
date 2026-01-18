import { listDrafts } from "@/lib/data/drafts";
import { listAccounts } from "@/lib/data/accounts";
import { DraftsTable } from "@/components/drafts/drafts-table";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const revalidate = 60;

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const params = await searchParams;
  const currencyFilter = params.currency;

  const [drafts, accounts] = await Promise.all([
    listDrafts(currencyFilter),
    listAccounts(),
  ]);

  // Extract unique currencies from drafts for filter options
  const currencies = Array.from(
    new Set(
      drafts
        .map((draft) => (draft.entities as any)?.currency)
        .filter((c): c is string => typeof c === "string" && c.length > 0)
    )
  ).sort();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Drafts &amp; Approvals</h2>
        <p className="text-sm text-muted-foreground">
          Review AI generated drafts, approve them, and post balanced journal entries.
        </p>
      </div>
      <CurrencyFilter initialCurrency={currencyFilter} currencies={currencies} />
      <DraftsTable drafts={drafts} accounts={accounts} />
      <Card>
        <CardHeader>
          <CardTitle>Workflow Guidance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Draft status indicates items created by AI awaiting review.</p>
          <p>• Approved items can be translated into immutable journal entries.</p>
          <p>• All actions are logged for auditability.</p>
        </CardContent>
      </Card>
    </div>
  );
}

