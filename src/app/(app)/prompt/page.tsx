import { PromptWorkspace } from "@/components/prompt/prompt-workspace";
import { getCapitalizationThresholdAed } from "@/lib/data/company-settings";

export default async function PromptPage() {
  const capitalizationThresholdAed = await getCapitalizationThresholdAed();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Record activity</h2>
        <p className="text-sm text-muted-foreground">
          Log sales, purchases, and payments in plain language — we&apos;ll prepare the paperwork for you.
        </p>
      </div>
      <PromptWorkspace capitalizationThresholdAed={capitalizationThresholdAed} />
    </div>
  );
}
