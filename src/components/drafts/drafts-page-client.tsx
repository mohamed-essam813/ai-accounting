"use client";

import { useCallback, useState } from "react";
import { DraftsTable } from "@/components/drafts/drafts-table";
import { DraftsToolbar } from "@/components/drafts/drafts-toolbar";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/lib/database.types";

// Account type - new fields are optional since they may not be in database types yet
type AccountRow = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

type DraftItem = {
  id: string;
  intent: string;
  status: string;
  confidence: number | null;
  created_at: string;
  entities: Record<string, unknown>;
};

type DraftsPageClientProps = {
  drafts: DraftItem[];
  accounts: AccountRow[] | Array<AccountRow & { detail_type?: string | null; allow_reconciliation?: boolean | null }>;
  userRole: string | null;
  displayCurrency?: string;
  baseCurrency?: string;
  /** When empty, dropdown shows all supported currencies. */
  currencies?: string[];
};

export function DraftsPageClient({
  drafts,
  accounts,
  userRole,
  displayCurrency,
  baseCurrency = "USD",
  currencies = [],
}: DraftsPageClientProps) {
  const [filteredDrafts, setFilteredDrafts] = useState<DraftItem[]>(drafts);

  const handleFilteredChange = useCallback((filtered: DraftItem[]) => {
    setFilteredDrafts(filtered);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Drafts &amp; Approvals</h2>
        <p className="text-sm text-muted-foreground">
          Review AI generated drafts, approve them, and post balanced journal entries.
        </p>
      </div>
      <CurrencyFilter
        initialCurrency={displayCurrency}
        baseCurrency={baseCurrency}
        currencies={currencies}
      />
      <DraftsToolbar drafts={drafts} onFilteredChange={handleFilteredChange} />
      <DraftsTable
        drafts={filteredDrafts}
        accounts={accounts}
        userRole={userRole}
        displayCurrency={displayCurrency}
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
