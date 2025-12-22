/**
 * Insight Display Component
 * Shows insights with primary/secondary/deep dive levels
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, AlertCircle, TrendingUp, DollarSign, Shield, Lightbulb } from "lucide-react";
import type { Insight } from "@/lib/insights/types";

interface Props {
  insight: Insight;
  showCategory?: boolean;
}

export function InsightCard({ insight, showCategory = true }: Props) {
  const levelConfig = {
    primary: {
      icon: AlertCircle,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
    },
    secondary: {
      icon: Info,
      color: "text-gray-600",
      bgColor: "bg-gray-50",
      borderColor: "border-gray-200",
    },
    deep_dive: {
      icon: TrendingUp,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
    },
  };

  const categoryConfig = {
    financial_impact: { label: "Financial Impact", icon: DollarSign },
    cash_flow: { label: "Cash Flow", icon: DollarSign },
    risk: { label: "Risk", icon: Shield },
    trend_behavior: { label: "Trend", icon: TrendingUp },
    actionable_next_step: { label: "Action", icon: Lightbulb },
  };

  const config = levelConfig[insight.level];
  const categoryInfo = categoryConfig[insight.category];
  const Icon = config.icon;
  const CategoryIcon = categoryInfo.icon;

  return (
    <Card className={`${config.bgColor} ${config.borderColor} border`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${config.color}`} />
            <CardTitle className="text-sm font-medium capitalize">
              {insight.level.replace("_", " ")}
            </CardTitle>
          </div>
          {showCategory && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <CategoryIcon className="h-3 w-3" />
              {categoryInfo.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed">{insight.insight_text}</p>
      </CardContent>
    </Card>
  );
}

