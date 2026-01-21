"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lightbulb, AlertCircle, CheckCircle, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { StructuredRecommendation } from "@/lib/insights/recommendations";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  recommendations: StructuredRecommendation[];
};

export function AIRecommendations({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            AI Recommendations
          </CardTitle>
          <CardDescription>
            CFO-grade insights based on your financial data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <p>No urgent recommendations at this time. Your financial metrics are stable.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          AI Recommendations
        </CardTitle>
        <CardDescription>
          CFO-grade insights: Observation → Risk/Opportunity → Action → Impact
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className={`p-4 rounded-lg border ${
              rec.priority === "high"
                ? "border-destructive/20 bg-destructive/5"
                : rec.priority === "medium"
                ? "border-orange-200 bg-orange-50/50"
                : "border-blue-200 bg-blue-50"
            }`}
          >
            <div className="space-y-3">
              {/* Observation */}
              <div>
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Observation</span>
                  {rec.priority === "high" && (
                    <span className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                      High Priority
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium">{rec.observation}</p>
              </div>

              {/* Risk/Opportunity */}
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase">Risk/Opportunity</span>
                <p className="text-sm text-muted-foreground mt-1">{rec.riskOrOpportunity}</p>
              </div>

              {/* Action */}
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase">Action</span>
                <p className="text-sm text-muted-foreground mt-1">{rec.action}</p>
              </div>

              {/* Impact */}
              <div className="pt-2 border-t">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Impact</span>
                <p className="text-sm font-medium text-foreground mt-1">{rec.impact}</p>
              </div>

              {/* Drill Down Link */}
              {rec.drillDownPath && (
                <div className="pt-2">
                  <Link href={rec.drillDownPath}>
                    <Button variant="outline" size="sm" className="w-full justify-between group">
                      <span>View Details</span>
                      <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
