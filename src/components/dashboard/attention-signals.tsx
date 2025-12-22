/**
 * Attention Signals Component
 * PRD Section 5.4: 4-6 tiles showing state-based indicators
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";
import type { AttentionSignal } from "@/lib/data/dashboard-prd";

interface Props {
  signals: AttentionSignal[];
}

export function AttentionSignals({ signals }: Props) {
  if (signals.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center py-8">
            No attention signals at this time. All systems stable.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {signals.map((signal) => (
        <AttentionSignalCard key={signal.id} signal={signal} />
      ))}
    </div>
  );
}

function AttentionSignalCard({ signal }: { signal: AttentionSignal }) {
  const statusConfig = {
    stable: {
      icon: Minus,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      badgeVariant: "secondary" as const,
    },
    improving: {
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      badgeVariant: "default" as const,
    },
    worsening: {
      icon: TrendingDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      badgeVariant: "destructive" as const,
    },
  };

  const config = statusConfig[signal.status];
  const Icon = config.icon;

  const content = (
    <Card className={`${config.bgColor} ${config.borderColor} border hover:shadow-md transition-shadow`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{signal.title}</CardTitle>
          <Badge variant={config.badgeVariant} className="text-xs">
            {signal.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-start gap-2">
          <Icon className={`h-4 w-4 ${config.color} mt-0.5 flex-shrink-0`} />
          <p className="text-sm text-muted-foreground leading-relaxed">{signal.explanation}</p>
        </div>
        {signal.drillDownPath && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
            <span>View details</span>
            <ArrowRight className="h-3 w-3" />
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (signal.drillDownPath) {
    return (
      <Link href={signal.drillDownPath} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

