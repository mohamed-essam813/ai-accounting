import { listAccounts } from "@/lib/data/accounts";
import { listJournalEntries } from "@/lib/data/journals";
import { JournalEntryForm } from "@/components/journals/journal-entry-form";
import { JournalEntriesTable } from "@/components/journals/journal-entries-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const revalidate = 60;

export default async function JournalsPage() {
  const [accounts, entries] = await Promise.all([
    listAccounts(),
    listJournalEntries(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Manual Journal Entries</h2>
        <p className="text-sm text-muted-foreground">
          Record accruals, depreciation, adjustments, and other manual accounting entries.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Create Journal Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <JournalEntryForm accounts={accounts} />
        </CardContent>
      </Card>
      <JournalEntriesTable entries={entries} accounts={accounts} />
    </div>
  );
}

