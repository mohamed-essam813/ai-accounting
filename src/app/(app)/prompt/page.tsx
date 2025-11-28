import { PromptComposer } from "@/components/prompt/prompt-composer";
import { OcrUploader } from "@/components/prompt/ocr-uploader";
import { SourceDocumentsList } from "@/components/prompt/source-documents-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listSourceDocuments } from "@/lib/data/documents";

export const revalidate = 60;

export default async function PromptPage() {
  const documents = await listSourceDocuments(6);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Prompt Workspace</h2>
        <p className="text-sm text-muted-foreground">
          Convert natural language instructions into structured accounting drafts with AI.
        </p>
      </div>
      <PromptComposer />
      <div className="grid gap-6 lg:grid-cols-2">
        <OcrUploader />
        <Card>
          <CardHeader>
            <CardTitle>Recent OCR Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <SourceDocumentsList documents={documents} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Supported Intents</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Create Invoice", description: "Debits Accounts Receivable, credits Revenue." },
            { label: "Create Bill", description: "Debits Expense, credits Accounts Payable." },
            { label: "Record Payment", description: "Debits Cash, credits Accounts Receivable." },
            { label: "Reconcile Bank", description: "Suggests ledger matches for uploaded statements." },
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

