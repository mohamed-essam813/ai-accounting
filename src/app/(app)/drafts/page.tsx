import { listDrafts } from "@/lib/data/drafts";
import { listAccounts } from "@/lib/data/accounts";
import { DraftsTable } from "@/components/drafts/drafts-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const revalidate = 60;

export default async function DraftsPage() {
  const [drafts, accounts] = await Promise.all([listDrafts(), listAccounts()]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Drafts &amp; Approvals</h2>
        <p className="text-sm text-muted-foreground">
          Review AI generated drafts, approve them, and post balanced journal entries.
        </p>
      </div>
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

