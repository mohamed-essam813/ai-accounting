import { listDrafts } from "@/lib/data/drafts";
import { listAccounts } from "@/lib/data/accounts";
import { DraftsTable } from "@/components/drafts/drafts-table";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/data/users";
import { convertCurrency } from "@/lib/utils/currency-conversion";

export const revalidate = 60;

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const params = await searchParams;
  const targetCurrency = params.currency; // For conversion, not filtering

  const [drafts, accounts, user] = await Promise.all([
    listDrafts(), // No filtering - show all drafts
    listAccounts(),
    getCurrentUser(),
  ]);

  // Convert draft amounts if targetCurrency is provided
  const convertedDrafts = targetCurrency && user?.tenant
    ? await Promise.all(
        drafts.map(async (draft) => {
          if (!user?.tenant) return draft;
          const originalCurrency = (draft.entities as { currency?: string })?.currency || "USD";
          const originalAmount = draft.entities.amount ?? 0;
          const draftDate = (draft.entities.date as string) || new Date().toISOString().split("T")[0];

          // If same currency, no conversion needed
          if (originalCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
            return {
              ...draft,
              entities: {
                ...draft.entities,
                amount: originalAmount,
                currency: targetCurrency,
                _originalCurrency: originalCurrency, // Keep original for reference
                _converted: false,
              },
            };
          }

          // Convert amount
          try {
            const convertedAmount = await convertCurrency(
              originalAmount,
              originalCurrency,
              targetCurrency,
              draftDate,
              user.tenant!.id,
            );

            return {
              ...draft,
              entities: {
                ...draft.entities,
                amount: convertedAmount,
                currency: targetCurrency,
                _originalCurrency: originalCurrency, // Keep original for reference
                _converted: true,
              } as typeof draft.entities & { _originalCurrency?: string; _converted?: boolean },
            } as typeof draft & { entities: typeof draft.entities & { _originalCurrency?: string; _converted?: boolean } };
          } catch (error) {
            console.error(`Failed to convert draft ${draft.id} amount:`, error);
            // Return original if conversion fails
            return draft;
          }
        }),
      )
    : drafts;

  // Extract unique currencies from drafts for conversion selector options
  const currencies = Array.from(
    new Set(
      drafts
        .map((draft) => (draft.entities as { currency?: string })?.currency)
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
      <CurrencyFilter initialCurrency={targetCurrency} currencies={currencies} />
      <DraftsTable 
        drafts={convertedDrafts} 
        accounts={accounts} 
        userRole={user?.role}
        displayCurrency={targetCurrency}
      />
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

