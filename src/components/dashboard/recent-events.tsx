/**
 * Recent Financial Events Component
 * PRD Section 5.4: "Events with meaning, not raw transactions"
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Receipt, CreditCard, BookOpen, Circle } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { RecentFinancialEvent } from "@/lib/data/dashboard-prd";

interface Props {
  events: RecentFinancialEvent[];
}

export function RecentFinancialEvents({ events }: Props) {
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Financial Events</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent financial events to display.
          </p>
        </CardContent>
      </Card>
    );
  }

  const iconMap = {
    invoice: FileText,
    bill: Receipt,
    payment: CreditCard,
    journal: BookOpen,
    other: Circle,
  };

  const badgeMap = {
    invoice: "Invoice",
    bill: "Bill",
    payment: "Payment",
    journal: "Journal",
    other: "Event",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent Financial Events</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {events.map((event) => {
          const Icon = iconMap[event.type];
          return (
            <div key={event.id} className="rounded-md border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline" className="text-xs">
                    {badgeMap[event.type]}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(event.date)}</span>
              </div>
              <p className="text-sm leading-relaxed">{event.description}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

