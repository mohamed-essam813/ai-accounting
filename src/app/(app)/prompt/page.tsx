import { PromptWorkspace } from "@/components/prompt/prompt-workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PromptPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Prompt Workspace</h2>
        <p className="text-sm text-muted-foreground">
          Describe transactions in plain language and let AI create structured accounting drafts.
        </p>
      </div>
      <PromptWorkspace />
      <Card>
        <CardHeader>
          <CardTitle>Supported Intents</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Create Invoice", description: "Debits Accounts Receivable, credits Revenue." },
            { label: "Create Bill", description: "Debits Expense, credits Accounts Payable." },
            { label: "Record Payment", description: "Debits Cash, credits Accounts Receivable." },
            { label: "Reconcile Bank", description: "Handles bank transactions: loans, deposits, transfers, fees. Debits Bank, credits vary (AR/AP, Loans, Capital)." },
          ].map((intent) => (
            <div key={intent.label} className="space-y-2 rounded-md border bg-card p-4">
              <Badge variant="secondary">{intent.label}</Badge>
              <p className="text-sm text-muted-foreground">{intent.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

