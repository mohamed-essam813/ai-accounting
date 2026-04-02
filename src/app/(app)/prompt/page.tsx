import { PromptWorkspace } from "@/components/prompt/prompt-workspace";

export default async function PromptPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Record activity</h2>
        <p className="text-sm text-muted-foreground">
          Log sales, purchases, and payments in plain language — we&apos;ll prepare the paperwork for you.
        </p>
      </div>
      <PromptWorkspace />
    </div>
  );
}
