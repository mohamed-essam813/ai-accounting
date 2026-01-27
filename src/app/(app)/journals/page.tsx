import { listAccounts } from "@/lib/data/accounts";
import { listJournalEntries, getJournalTemplates } from "@/lib/data/journals";
import { JournalEntryForm } from "@/components/journals/journal-entry-form";
import { JournalEntriesTable } from "@/components/journals/journal-entries-table";
import { JournalFilters } from "@/components/journals/journal-filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const revalidate = 60;

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    accountCode?: string;
    search?: string;
    status?: string;
    entryId?: string;
    edit?: string;
  }>;
}) {
  const params = await searchParams;
  const statusFilter =
    params.status === "draft" || params.status === "posted" ? params.status : "all";
  const [user, accounts, entries, templates] = await Promise.all([
    import("@/lib/data/users").then((m) => m.getCurrentUser()),
    listAccounts(),
    listJournalEntries({
      startDate: params.startDate,
      endDate: params.endDate,
      accountCode: params.accountCode,
      search: params.search,
      status: statusFilter,
      limit: 100,
    }),
    getJournalTemplates(),
  ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
  }));

  const editingEntry =
    params.edit && params.edit.length > 0
      ? entries.find((e) => e.id === params.edit) ?? null
      : null;

  const cancelParams = new URLSearchParams();
  if (params.startDate) cancelParams.set("startDate", params.startDate);
  if (params.endDate) cancelParams.set("endDate", params.endDate);
  if (params.accountCode) cancelParams.set("accountCode", params.accountCode);
  if (params.search) cancelParams.set("search", params.search);
  if (params.status) cancelParams.set("status", params.status);
  if (params.entryId) cancelParams.set("entryId", params.entryId);
  const cancelHref =
    cancelParams.toString().length > 0
      ? `/journals?${cancelParams.toString()}`
      : "/journals";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Manual Journal Entries</h2>
        <p className="text-sm text-muted-foreground">
          Record accruals, depreciation, adjustments, and other manual entries. Use filters to find entries.
        </p>
      </div>

      <JournalFilters
        initialStartDate={params.startDate}
        initialEndDate={params.endDate}
        initialAccountCode={params.accountCode}
        initialSearch={params.search}
        initialStatus={params.status}
        accounts={accountOptions}
      />

      {editingEntry && editingEntry.status === "draft" ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit Draft</CardTitle>
            <p className="text-sm text-muted-foreground">
              Update draft journal entry. Only drafts can be edited.
            </p>
          </CardHeader>
          <CardContent>
            <JournalEntryForm
              key={editingEntry.id}
              accounts={accounts}
              editEntry={editingEntry}
              cancelHref={cancelHref}
              templates={templates}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Create Journal Entry</CardTitle>
          </CardHeader>
          <CardContent>
            <JournalEntryForm accounts={accounts} templates={templates} />
          </CardContent>
        </Card>
      )}

      <JournalEntriesTable
        entries={entries}
        accounts={accountOptions}
        userRole={user?.role ?? null}
        highlightedEntryId={params.entryId}
        filterParams={params}
      />
    </div>
  );
}
