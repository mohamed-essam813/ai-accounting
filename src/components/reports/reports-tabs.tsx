"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

type ReportsTabsProps = {
  defaultTab: string;
  children: React.ReactNode;
};

export function ReportsTabs({ defaultTab, children }: ReportsTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Get current tab from URL or use default
  const currentTab = searchParams.get("tab") || defaultTab;

  const handleTabChange = (value: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value !== "pnl") {
        params.set("tab", value);
      } else {
        params.delete("tab");
      }
      router.push(`/reports/pnl?${params.toString()}`);
    });
  };

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
      <div className="relative">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="pnl" disabled={isPending}>
            P&amp;L
          </TabsTrigger>
          <TabsTrigger value="balance" disabled={isPending}>
            Balance Sheet
          </TabsTrigger>
          <TabsTrigger value="cashflow" disabled={isPending}>
            Cash Flow
          </TabsTrigger>
          <TabsTrigger value="ledger" disabled={isPending}>
            Journal Ledger
          </TabsTrigger>
          <TabsTrigger value="vat" disabled={isPending}>
            VAT Report
          </TabsTrigger>
          <TabsTrigger value="trial" disabled={isPending}>
            Trial Balance
          </TabsTrigger>
          <TabsTrigger value="ar" disabled={isPending}>
            AR Ageing
          </TabsTrigger>
          <TabsTrigger value="ap" disabled={isPending}>
            AP Ageing
          </TabsTrigger>
        </TabsList>
        {isPending && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      {isPending ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        children
      )}
    </Tabs>
  );
}

