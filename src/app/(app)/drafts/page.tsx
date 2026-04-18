import { Suspense } from "react";
import { listDrafts } from "@/lib/data/drafts";
import { listAccounts } from "@/lib/data/accounts";
import { DraftsPageClient } from "@/components/drafts/drafts-page-client";
import { getCurrentUser } from "@/lib/data/users";
import { convertCurrency, getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { normaliseCurrencyCode } from "@/lib/currencies";
import type { Account } from "@/lib/accounting";

export const revalidate = 60;

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const params = await searchParams;
  const rawCurrency = params.currency;
  const currency =
    rawCurrency && rawCurrency !== "all"
      ? normaliseCurrencyCode(rawCurrency)
      : rawCurrency;
  const [drafts, accounts, user] = await Promise.all([
    listDrafts(),
    listAccounts(),
    getCurrentUser(),
  ]);
  const baseCurrency = user?.tenant
    ? await getTenantBaseCurrency(user.tenant.id)
    : "USD";

  // No param => default "All Currencies". "all" => no conversion, per-draft currency. Else => selected currency.
  const targetCurrency =
    currency === "all" || !currency ? undefined : currency;
  const displayCurrency = currency ?? "all";

  // Convert draft amounts when targetCurrency is set (base or specific)
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

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading drafts…</div>}>
      <DraftsPageClient
        key={displayCurrency}
        drafts={convertedDrafts}
        accounts={accounts as Account[]}
        userRole={user?.role ?? null}
        displayCurrency={displayCurrency}
        baseCurrency={baseCurrency}
        currencies={[]}
      />
    </Suspense>
  );
}

