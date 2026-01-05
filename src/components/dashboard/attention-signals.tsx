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

  // Visual hierarchy: worsening signals first, then improving, then stable (Feedback Section 6)
  const sortedSignals = [...signals].sort((a, b) => {
    const order = { worsening: 0, improving: 1, stable: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sortedSignals.map((signal) => (
        <div key={signal.id} className="h-full">
          <AttentionSignalCard signal={signal} />
        </div>
      ))}
    </div>
  );
}

export function AttentionSignalCard({ signal }: { signal: AttentionSignal }) {
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

  // Visual hierarchy: worsening signals visually dominate (Feedback Section 6)
  const isWorsening = signal.status === "worsening";
  const isStable = signal.status === "stable";
  
  // Worsening signals: larger, bolder, more prominent
  // Stable signals: visually recede
  const cardClassName = isWorsening
    ? `${config.bgColor} ${config.borderColor} border-2 shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer group`
    : isStable
    ? `${config.bgColor} ${config.borderColor} border opacity-75 hover:opacity-100 hover:shadow-md transition-all duration-200 cursor-pointer group`
    : `${config.bgColor} ${config.borderColor} border-2 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer group`;

  const titleClassName = isWorsening
    ? "text-sm font-bold"
    : isStable
    ? "text-sm font-medium"
    : "text-sm font-semibold";

  const explanationClassName = isWorsening
    ? "text-sm font-medium text-foreground leading-relaxed"
    : isStable
    ? "text-sm text-muted-foreground leading-relaxed"
    : "text-sm text-muted-foreground leading-relaxed";

  const content = (
    <Card className={`${cardClassName} h-full flex flex-col`}>
      <CardHeader className={isWorsening ? "pb-3" : "pb-2"}>
        <div className="flex items-center justify-between">
          <CardTitle className={titleClassName}>{signal.title}</CardTitle>
          <Badge variant={config.badgeVariant} className={`text-xs capitalize ${isWorsening ? "font-semibold" : ""}`}>
            {signal.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 flex-1 flex flex-col">
        <div className="flex items-start gap-3 flex-1">
          <div className={`p-1.5 rounded-md ${config.bgColor} ${config.borderColor} border ${isWorsening ? "ring-1 ring-offset-1" : ""}`}>
            <Icon className={`h-4 w-4 ${config.color} flex-shrink-0 ${isWorsening ? "h-5 w-5" : ""}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={explanationClassName}>
              {signal.explanation.split(/(AED\s?[\d,]+\.?\d*|\$[\d,]+\.?\d*|[\d,]+\.?\d*%)/g).map((part, i) => {
                // Check if this part is a currency amount or percentage
                if (/^(AED\s?[\d,]+\.?\d*|\$[\d,]+\.?\d*|[\d,]+\.?\d*%)$/.test(part)) {
                  // Make currency amounts clickable for traceability (Excel Elimination Doctrine)
                  const accountCode = getAccountCodeForSignal(signal.id);
                  if (accountCode) {
                    return (
                      <Link
                        key={i}
                        href={`/ledger?accountCode=${accountCode}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`font-bold text-foreground hover:text-primary underline decoration-dotted ${isWorsening ? "text-lg" : "text-base"}`}
                        title="Click to view ledger transactions"
                      >
                        {part}
                      </Link>
                    );
                  }
                  return (
                    <span key={i} className={`font-bold text-foreground ${isWorsening ? "text-lg" : "text-base"}`}>
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
          <div className={`flex items-center gap-1.5 text-xs font-medium text-primary pt-2 group-hover:gap-2 transition-all ${isWorsening ? "font-semibold" : ""} mt-auto`}>
            <span>View details</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (signal.drillDownPath) {
    return (
      <Link href={signal.drillDownPath} className="block h-full">
        {content}
      </Link>
    );
  }

  return content;
}

/**
 * Get account code for signal to enable traceability
 * Excel Elimination Doctrine: Traceability (≤3 clicks)
 */
function getAccountCodeForSignal(signalId: string): string | null {
  const accountMap: Record<string, string> = {
    cash_flow: "1000", // Cash
    receivables_health: "1100", // Accounts Receivable
    payables_pressure: "2000", // Accounts Payable
  };
  return accountMap[signalId] || null;
}

