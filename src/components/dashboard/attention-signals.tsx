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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
    <Card className={`${config.bgColor} ${config.borderColor} border-2 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer group`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{signal.title}</CardTitle>
          <Badge variant={config.badgeVariant} className="text-xs capitalize">
            {signal.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <div className={`p-1.5 rounded-md ${config.bgColor} ${config.borderColor} border`}>
            <Icon className={`h-4 w-4 ${config.color} flex-shrink-0`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {signal.explanation.split(/(AED\s?[\d,]+\.?\d*|\$[\d,]+\.?\d*|[\d,]+\.?\d*%)/g).map((part, i) => {
                // Check if this part is a currency amount or percentage
                if (/^(AED\s?[\d,]+\.?\d*|\$[\d,]+\.?\d*|[\d,]+\.?\d*%)$/.test(part)) {
                  return (
                    <span key={i} className="font-bold text-foreground text-base">
                      {part}
                    </span>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </p>
          </div>
        </div>
        {signal.drillDownPath && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary pt-2 group-hover:gap-2 transition-all">
            <span>View details</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
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

