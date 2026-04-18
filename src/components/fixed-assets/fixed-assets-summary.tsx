import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

type Props = {
  totalCost: number;
  totalAccumulatedDepreciation: number;
  totalNbv: number;
  displayCurrency: string;
  /** Shown when using the default active register or matching filter context */
  registerRowCount: number;
  activeAssetCount: number;
};

export function FixedAssetsSummary({
  totalCost,
  totalAccumulatedDepreciation,
  totalNbv,
  displayCurrency,
  registerRowCount,
  activeAssetCount,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Register / active</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {registerRowCount} <span className="text-base font-normal text-muted-foreground">shown</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{activeAssetCount} active in tenant</p>
        </CardContent>
      </Card>
    </div>
  );
}
