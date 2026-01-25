"use client";

import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type TenantSwitcherProps = {
  tenantName: string;
};

export function TenantSwitcher({ tenantName }: TenantSwitcherProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between border-dashed bg-background text-sm"
        >
          <span className="truncate text-xs font-medium">{tenantName}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[320px]">
        <SheetHeader>
          <SheetTitle>Select Tenant</SheetTitle>
        </SheetHeader>
        <p className="mt-4 text-sm text-muted-foreground">
          Tenant switching will be available once multiple entities are configured. Contact an
          administrator to add additional companies.
        </p>
      </SheetContent>
    </Sheet>
  );
}

