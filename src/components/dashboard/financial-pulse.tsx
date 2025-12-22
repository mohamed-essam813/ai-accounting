/**
 * Financial Pulse Component
 * PRD Section 5.4: "One short system-generated sentence"
 */

import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { FinancialPulse } from "@/lib/data/dashboard-prd";

interface Props {
  pulse: FinancialPulse;
}

export function FinancialPulseCard({ pulse }: Props) {
  const iconMap = {
    calm: CheckCircle2,
    attention: Info,
    urgent: AlertCircle,
  };

  const colorMap = {
    calm: "text-green-600",
    attention: "text-yellow-600",
    urgent: "text-red-600",
  };

  const bgColorMap = {
    calm: "bg-green-50 border-green-200",
    attention: "bg-yellow-50 border-yellow-200",
    urgent: "bg-red-50 border-red-200",
  };

  const Icon = iconMap[pulse.severity];

  return (
    <Card className={`${bgColorMap[pulse.severity]} border-2`}>
      <CardContent>
        <div className="flex items-start gap-3">
          <Icon className={`h-5 w-5 ${colorMap[pulse.severity]} mt-0.5 flex-shrink-0`} />
          <p className={`text-base leading-relaxed ${pulse.severity === "urgent" ? "font-semibold" : ""}`}>
            {pulse.text}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

