import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

type Props = {
  totalCost: number;
  totalAccumulatedDepreciation: number;
  totalNbv: number;
  displayCurrency: string;
};

export function FixedAssetsSummary({ totalCost, totalAccumulatedDepreciation, totalNbv, displayCurrency }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total cost (PPE)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">{formatCurrency(totalCost, displayCurrency)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Accumulated depreciation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">{formatCurrency(totalAccumulatedDepreciation, displayCurrency)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Net book value</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">{formatCurrency(totalNbv, displayCurrency)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
