/**
 * Insights List Component
 * Displays multiple insights grouped by level
 */

import { InsightCard } from "./insight-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Insight } from "@/lib/insights/types";

interface Props {
  insights: Insight[];
  title?: string;
}

export function InsightsList({ insights, title = "Insights" }: Props) {
  if (insights.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center py-4">
            No insights available for this transaction.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by level
  const primary = insights.filter((i) => i.level === "primary");
  const secondary = insights.filter((i) => i.level === "secondary");
  const deepDive = insights.filter((i) => i.level === "deep_dive");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {primary.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Primary Insights
            </h4>
            <div className="space-y-2">
              {primary.map((insight) => (
                <InsightCard key={insight.id || Math.random()} insight={insight} />
              ))}
            </div>
          </div>
        )}

        {secondary.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Additional Context
            </h4>
            <div className="space-y-2">
              {secondary.map((insight) => (
                <InsightCard key={insight.id || Math.random()} insight={insight} />
              ))}
            </div>
          </div>
        )}

        {deepDive.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Deep Dive
            </h4>
            <div className="space-y-2">
              {deepDive.map((insight) => (
                <InsightCard key={insight.id || Math.random()} insight={insight} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

