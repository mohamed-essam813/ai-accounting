import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function FixedAssetReportsPlaceholderPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/reports/pnl" className="hover:underline">
            Reports
          </Link>
        </p>
        <h2 className="text-2xl font-semibold mt-1">Fixed asset reports</h2>
        <p className="text-sm text-muted-foreground mt-1">Placeholders for deeper reporting (Prompt 9).</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Fixed asset schedule</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Per-asset cost, accumulated depreciation, NBV, current-period depreciation, and disposal — groupable by category, location,
          and assignee. Full build in the reports release.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Depreciation summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Depreciation expense by category for a period. Ties to posted 5600 lines.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Disposal register</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          All disposals in a range with gain/loss and linked journal entries.
        </CardContent>
      </Card>
    </div>
  );
}
